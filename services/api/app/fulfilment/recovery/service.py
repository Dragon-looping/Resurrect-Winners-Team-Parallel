"""Godown recovery search, explainable preview, and lookup services."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.fulfilment.lifecycle import transition_order_status
from app.fulfilment.orders import OrderError, get_order_by_id
from app.fulfilment.recovery.costing import evaluate_recovery_economics
from app.fulfilment.recovery.donor import find_eligible_donors
from app.fulfilment.recovery.timeline import evaluate_route_timeline
from app.fulfilment.recovery.validation import validate_recovery_candidate
from app.inventory.engine import recompute_balance_for_pair
from app.models import (
    CustomerOrder,
    InventoryBalance,
    InventoryEvent,
    InventoryEventType,
    OrderAllocation,
    OrderStatus,
    Plant,
    RecoveryAuditLog,
    RecoveryPlan,
    RecoveryStatus,
    RecoveryType,
)
from app.schemas.recovery import (
    RecoveryOptionItem,
    RecoveryPreviewRequest,
    RecoverySearchRequest,
    RecoverySearchResponse,
)


def _get_stock_version(db: Session, plant_id: int, sku_id: int) -> int:
    return db.execute(
        select(func.coalesce(func.max(InventoryEvent.id), 0)).where(
            InventoryEvent.plant_id == plant_id,
            InventoryEvent.sku_id == sku_id,
        )
    ).scalar_one()


def _evaluate_option(
    db: Session,
    *,
    target_order: CustomerOrder,
    donor_plant_id: int,
    donor_plant_name: str,
    donor_order: CustomerOrder | None,
    quantity: int,
    unit_selling_price: float,
    unit_procurement_cost: float,
    wait_penalty_per_unit: float,
    margin_floor_pct: float | None,
    evaluated_at: datetime | None,
) -> tuple[RecoveryOptionItem, dict[str, object]]:
    """Run validation, timeline, and economic checks for a single donor candidate."""
    reasons = validate_recovery_candidate(
        db,
        target_order=target_order,
        donor_plant_id=donor_plant_id,
        quantity=quantity,
        donor_order=donor_order,
    )
    timeline = evaluate_route_timeline(
        db,
        from_plant_id=donor_plant_id,
        to_plant_id=target_order.plant_id,
        delivery_deadline=target_order.agreed_delivery_date,
        now=evaluated_at,
    )
    reasons.extend(timeline.rejection_reasons)

    freight_per_unit = timeline.route.freight_cost_per_unit if timeline.route else 0.0
    fixed_cost = timeline.route.fixed_dispatch_cost if timeline.route else 0.0
    economics = evaluate_recovery_economics(
        quantity=quantity,
        freight_cost_per_unit=freight_per_unit,
        fixed_dispatch_cost=fixed_cost,
        unit_selling_price=unit_selling_price,
        unit_procurement_cost=unit_procurement_cost,
        wait_penalty_per_unit=wait_penalty_per_unit,
        margin_floor_pct=margin_floor_pct,
    )
    reasons.extend(economics.rejection_reasons)

    is_feasible = len(reasons) == 0
    rec_type = RecoveryType.ORDER_SWAP if donor_order is not None else RecoveryType.SURPLUS_TRANSFER
    explanation_text = (
        f"Feasible {rec_type.value} of {quantity} units from {donor_plant_name} "
        f"(net benefit {economics.net_benefit:.2f}, margin {economics.gross_margin_pct:.2f}%)."
        if is_feasible
        else f"Rejected {rec_type.value} from {donor_plant_name}: {'; '.join(reasons)}"
    )

    item = RecoveryOptionItem(
        recovery_type=rec_type,
        donor_plant_id=donor_plant_id,
        donor_plant_name=donor_plant_name,
        donor_order_id=donor_order.id if donor_order else None,
        quantity=quantity,
        is_feasible=is_feasible,
        rejection_reasons=reasons,
        wait_cost=economics.wait_cost,
        recovery_cost=economics.recovery_cost,
        net_benefit=economics.net_benefit,
        gross_margin_pct=economics.gross_margin_pct,
        margin_floor_pct=economics.margin_floor_pct,
        estimated_delivery_at=timeline.estimated_delivery_at,
        explanation=explanation_text,
    )
    details: dict[str, object] = {
        "summary": explanation_text,
        "route_id": timeline.route.id if timeline.route else None,
        "dispatch_at": timeline.dispatch_at.isoformat() if timeline.dispatch_at else None,
        "estimated_delivery_at": (
            timeline.estimated_delivery_at.isoformat() if timeline.estimated_delivery_at else None
        ),
        "wait_cost": economics.wait_cost,
        "recovery_cost": economics.recovery_cost,
        "net_benefit": economics.net_benefit,
        "gross_margin_pct": economics.gross_margin_pct,
        "margin_floor_pct": economics.margin_floor_pct,
        "rejection_reasons": reasons,
    }
    return item, details


def search_recovery_options(
    db: Session,
    payload: RecoverySearchRequest,
) -> RecoverySearchResponse:
    """Search multi-godown donor options for an order and rank feasible plans first."""
    target_order = get_order_by_id(db, payload.target_order_id)
    remaining = target_order.quantity - target_order.allocated_quantity
    needed = payload.quantity if payload.quantity is not None else max(1, remaining)

    donors = find_eligible_donors(db, target_order, needed)
    options: list[RecoveryOptionItem] = []

    for donor in donors:
        donor_order = (
            db.get(CustomerOrder, donor.donor_order_id) if donor.donor_order_id is not None else None
        )
        item, _ = _evaluate_option(
            db,
            target_order=target_order,
            donor_plant_id=donor.donor_plant_id,
            donor_plant_name=donor.donor_plant_name,
            donor_order=donor_order,
            quantity=donor.max_donatable_quantity,
            unit_selling_price=payload.unit_selling_price,
            unit_procurement_cost=payload.unit_procurement_cost,
            wait_penalty_per_unit=payload.wait_penalty_per_unit,
            margin_floor_pct=payload.margin_floor_pct,
            evaluated_at=payload.evaluated_at,
        )
        options.append(item)

    options.sort(key=lambda o: (not o.is_feasible, -o.net_benefit, o.donor_plant_id))

    db.add(
        RecoveryAuditLog(
            recovery_plan_id=None,
            action="SEARCH",
            actor="system",
            details={
                "target_order_id": target_order.id,
                "needed_quantity": needed,
                "options_found": len(options),
                "feasible_count": sum(1 for o in options if o.is_feasible),
            },
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    return RecoverySearchResponse(
        target_order_id=target_order.id,
        sku_id=target_order.sku_id,
        needed_quantity=needed,
        options=options,
    )


def preview_recovery_swap(
    db: Session,
    payload: RecoveryPreviewRequest,
) -> RecoveryPlan:
    """Create an explainable RecoveryPlan in PREVIEW status without executing it."""
    target_order = get_order_by_id(db, payload.target_order_id)
    donor_plant = db.execute(
        select(Plant).where(Plant.id == payload.donor_plant_id)
    ).scalar_one_or_none()
    if donor_plant is None:
        raise OrderError(f"Donor plant with id={payload.donor_plant_id} not found.", status_code=404)

    donor_order: CustomerOrder | None = None
    if payload.donor_order_id is not None:
        donor_order = get_order_by_id(db, payload.donor_order_id)

    remaining = target_order.quantity - target_order.allocated_quantity
    qty = payload.quantity if payload.quantity is not None else max(1, remaining)

    item, details = _evaluate_option(
        db,
        target_order=target_order,
        donor_plant_id=donor_plant.id,
        donor_plant_name=donor_plant.name,
        donor_order=donor_order,
        quantity=qty,
        unit_selling_price=payload.unit_selling_price,
        unit_procurement_cost=payload.unit_procurement_cost,
        wait_penalty_per_unit=payload.wait_penalty_per_unit,
        margin_floor_pct=payload.margin_floor_pct,
        evaluated_at=payload.evaluated_at,
    )

    now_utc = datetime.now(timezone.utc)
    plan = RecoveryPlan(
        target_order_id=target_order.id,
        donor_plant_id=donor_plant.id,
        donor_order_id=donor_order.id if donor_order else None,
        sku_id=target_order.sku_id,
        quantity=qty,
        recovery_type=item.recovery_type.value,
        status=RecoveryStatus.PREVIEW.value,
        is_feasible=item.is_feasible,
        rejection_reasons=item.rejection_reasons,
        wait_cost=item.wait_cost,
        recovery_cost=item.recovery_cost,
        net_benefit=item.net_benefit,
        gross_margin_pct=item.gross_margin_pct,
        margin_floor_pct=item.margin_floor_pct,
        estimated_delivery_at=item.estimated_delivery_at,
        target_order_version=target_order.version,
        donor_order_version=donor_order.version if donor_order else None,
        target_stock_version=_get_stock_version(db, target_order.plant_id, target_order.sku_id),
        donor_stock_version=_get_stock_version(db, donor_plant.id, target_order.sku_id),
        explanation=details,
        created_at=now_utc,
    )
    db.add(plan)
    db.flush()

    db.add(
        RecoveryAuditLog(
            recovery_plan_id=plan.id,
            action="PREVIEW" if plan.is_feasible else "REJECTED",
            actor="system",
            details=details,
            created_at=now_utc,
        )
    )
    db.commit()
    db.refresh(plan)
    return plan


def get_recovery_alternatives(
    db: Session,
    recovery_id: int,
) -> tuple[RecoveryPlan, list[RecoveryOptionItem], list[RecoveryAuditLog]]:
    """Return alternative donor options and audit history for a recovery plan."""
    plan = get_recovery_plan(db, recovery_id)
    target_order = get_order_by_id(db, plan.target_order_id)

    donors = find_eligible_donors(db, target_order, plan.quantity)
    alternatives: list[RecoveryOptionItem] = []
    for donor in donors:
        if donor.donor_plant_id == plan.donor_plant_id and donor.donor_order_id == plan.donor_order_id:
            continue
        donor_order = (
            db.get(CustomerOrder, donor.donor_order_id) if donor.donor_order_id is not None else None
        )
        item, _ = _evaluate_option(
            db,
            target_order=target_order,
            donor_plant_id=donor.donor_plant_id,
            donor_plant_name=donor.donor_plant_name,
            donor_order=donor_order,
            quantity=donor.max_donatable_quantity,
            unit_selling_price=1000.0,
            unit_procurement_cost=600.0,
            wait_penalty_per_unit=250.0,
            margin_floor_pct=plan.margin_floor_pct,
            evaluated_at=None,
        )
        alternatives.append(item)

    alternatives.sort(key=lambda o: (not o.is_feasible, -o.net_benefit, o.donor_plant_id))

    logs = list(
        db.execute(
            select(RecoveryAuditLog)
            .where(RecoveryAuditLog.recovery_plan_id == plan.id)
            .order_by(RecoveryAuditLog.created_at.asc(), RecoveryAuditLog.id.asc())
        )
        .scalars()
        .all()
    )
    return plan, alternatives, logs


def get_recovery_plan(db: Session, recovery_id: int) -> RecoveryPlan:
    """Fetch a recovery plan by ID or raise OrderError(404)."""
    plan = db.execute(
        select(RecoveryPlan).where(RecoveryPlan.id == recovery_id)
    ).scalar_one_or_none()
    if plan is None:
        raise OrderError(f"Recovery plan with id={recovery_id} not found.", status_code=404)
    return plan


def _next_recovery_seq(db: Session) -> int:
    val = db.execute(
        select(func.max(InventoryEvent.source_sequence)).where(
            InventoryEvent.source == "godown-recovery"
        )
    ).scalar_one()
    return (val or 0) + 1


def approve_recovery_plan(
    db: Session,
    recovery_id: int,
    *,
    actor: str = "operator",
) -> RecoveryPlan:
    """Revalidate versions and feasibility, then atomically execute a recovery plan."""
    plan = get_recovery_plan(db, recovery_id)

    if plan.status != RecoveryStatus.PREVIEW.value:
        raise OrderError(
            f"Recovery plan id={recovery_id} is already {plan.status.lower()}.",
            status_code=409,
        )

    if not plan.is_feasible:
        raise OrderError(
            f"Cannot approve infeasible recovery plan: {'; '.join(plan.rejection_reasons)}",
            status_code=422,
        )

    target_order = get_order_by_id(db, plan.target_order_id)
    if target_order.version != plan.target_order_version:
        raise OrderError(
            "Target order changed since recovery preview; regenerate preview.",
            status_code=409,
        )

    donor_order: CustomerOrder | None = None
    if plan.donor_order_id is not None:
        donor_order = get_order_by_id(db, plan.donor_order_id)
        if donor_order.version != plan.donor_order_version:
            raise OrderError(
                "Donor order changed since recovery preview; regenerate preview.",
                status_code=409,
            )

    if _get_stock_version(db, target_order.plant_id, plan.sku_id) != plan.target_stock_version:
        raise OrderError(
            "Target plant stock changed since recovery preview; regenerate preview.",
            status_code=409,
        )

    if _get_stock_version(db, plan.donor_plant_id, plan.sku_id) != plan.donor_stock_version:
        raise OrderError(
            "Donor plant stock changed since recovery preview; regenerate preview.",
            status_code=409,
        )

    reasons = validate_recovery_candidate(
        db,
        target_order=target_order,
        donor_plant_id=plan.donor_plant_id,
        quantity=plan.quantity,
        donor_order=donor_order,
    )
    if reasons:
        raise OrderError("; ".join(reasons), status_code=422)

    now_utc = datetime.now(timezone.utc)
    try:
        # 1. If ORDER_SWAP, release donor_order's allocation by plan.quantity
        if donor_order is not None:
            seq = _next_recovery_seq(db)
            rel_ev = InventoryEvent(
                source="godown-recovery",
                external_event_id=f"rec-{plan.id}-release-{uuid4().hex[:8]}",
                plant_id=plan.donor_plant_id,
                sku_id=plan.sku_id,
                event_type=InventoryEventType.STOCK_RELEASED.value,
                quantity=plan.quantity,
                source_sequence=seq,
                occurred_at=now_utc,
                received_at=now_utc,
                metadata_json={"recovery_plan_id": plan.id, "donor_order_id": donor_order.id},
            )
            db.add(rel_ev)
            db.flush()
            recompute_balance_for_pair(
                db, plan.donor_plant_id, plan.sku_id, reference_now=now_utc, validate_rules=True
            )

            donor_allocs = list(
                db.execute(
                    select(OrderAllocation)
                    .where(
                        OrderAllocation.order_id == donor_order.id,
                        OrderAllocation.status == "ACTIVE",
                    )
                    .order_by(OrderAllocation.id.asc())
                )
                .scalars()
                .all()
            )
            remaining_to_reduce = plan.quantity
            for alloc in donor_allocs:
                if remaining_to_reduce <= 0:
                    break
                if alloc.allocated_quantity <= remaining_to_reduce:
                    remaining_to_reduce -= alloc.allocated_quantity
                    alloc.status = "RELEASED"
                    alloc.updated_at = now_utc
                else:
                    alloc.allocated_quantity -= remaining_to_reduce
                    alloc.updated_at = now_utc
                    remaining_to_reduce = 0

            donor_order.allocated_quantity -= plan.quantity
            new_donor_status = (
                OrderStatus.PARTIALLY_ALLOCATED
                if donor_order.allocated_quantity > 0
                else OrderStatus.BACKLOGGED
            )
            transition_order_status(
                db,
                donor_order,
                new_donor_status,
                reason=f"Donated {plan.quantity} units under approved recovery plan id={plan.id}.",
                commit=False,
            )

        # 2. Dispatch from donor godown
        seq = _next_recovery_seq(db)
        disp_ev = InventoryEvent(
            source="godown-recovery",
            external_event_id=f"rec-{plan.id}-dispatch-{uuid4().hex[:8]}",
            plant_id=plan.donor_plant_id,
            sku_id=plan.sku_id,
            event_type=InventoryEventType.STOCK_DISPATCHED.value,
            quantity=plan.quantity,
            source_sequence=seq,
            occurred_at=now_utc,
            received_at=now_utc,
            metadata_json={"recovery_plan_id": plan.id, "to_plant_id": target_order.plant_id},
        )
        db.add(disp_ev)
        db.flush()
        recompute_balance_for_pair(
            db, plan.donor_plant_id, plan.sku_id, reference_now=now_utc, validate_rules=True
        )

        # 3. Receive at target godown
        seq = _next_recovery_seq(db)
        recv_ev = InventoryEvent(
            source="godown-recovery",
            external_event_id=f"rec-{plan.id}-receive-{uuid4().hex[:8]}",
            plant_id=target_order.plant_id,
            sku_id=plan.sku_id,
            event_type=InventoryEventType.STOCK_RECEIVED.value,
            quantity=plan.quantity,
            source_sequence=seq,
            occurred_at=now_utc,
            received_at=now_utc,
            metadata_json={"recovery_plan_id": plan.id, "from_plant_id": plan.donor_plant_id},
        )
        db.add(recv_ev)
        db.flush()
        recompute_balance_for_pair(
            db, target_order.plant_id, plan.sku_id, reference_now=now_utc, validate_rules=True
        )

        # 4. Reserve for target order
        seq = _next_recovery_seq(db)
        res_ev = InventoryEvent(
            source="godown-recovery",
            external_event_id=f"rec-{plan.id}-reserve-{uuid4().hex[:8]}",
            plant_id=target_order.plant_id,
            sku_id=plan.sku_id,
            event_type=InventoryEventType.STOCK_RESERVED.value,
            quantity=plan.quantity,
            source_sequence=seq,
            occurred_at=now_utc,
            received_at=now_utc,
            metadata_json={"recovery_plan_id": plan.id, "target_order_id": target_order.id},
        )
        db.add(res_ev)
        db.flush()
        recompute_balance_for_pair(
            db, target_order.plant_id, plan.sku_id, reference_now=now_utc, validate_rules=True
        )

        db.add(
            OrderAllocation(
                order_id=target_order.id,
                plant_id=target_order.plant_id,
                sku_id=plan.sku_id,
                allocated_quantity=plan.quantity,
                reservation_event_id=res_ev.id,
                status="ACTIVE",
                created_at=now_utc,
                updated_at=now_utc,
            )
        )
        target_order.allocated_quantity += plan.quantity
        new_target_status = (
            OrderStatus.ALLOCATED
            if target_order.allocated_quantity >= target_order.quantity
            else OrderStatus.PARTIALLY_ALLOCATED
        )
        transition_order_status(
            db,
            target_order,
            new_target_status,
            reason=f"Received {plan.quantity} units from approved recovery plan id={plan.id}.",
            commit=False,
        )

        plan.status = RecoveryStatus.APPROVED.value
        plan.approved_at = now_utc
        db.add(
            RecoveryAuditLog(
                recovery_plan_id=plan.id,
                action="APPROVED",
                actor=actor,
                details={
                    "target_order_id": target_order.id,
                    "donor_plant_id": plan.donor_plant_id,
                    "donor_order_id": plan.donor_order_id,
                    "quantity": plan.quantity,
                },
                created_at=now_utc,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(plan)
    return plan


def get_recovery_alternatives(
    db: Session,
    recovery_id: int,
) -> tuple[RecoveryPlan, list[RecoveryOptionItem], list[RecoveryAuditLog]]:
    """Return alternative donor options and audit history for a recovery plan."""
    plan = get_recovery_plan(db, recovery_id)
    target_order = get_order_by_id(db, plan.target_order_id)

    donors = find_eligible_donors(db, target_order, plan.quantity)
    alternatives: list[RecoveryOptionItem] = []
    for donor in donors:
        if donor.donor_plant_id == plan.donor_plant_id and donor.donor_order_id == plan.donor_order_id:
            continue
        donor_order = (
            db.get(CustomerOrder, donor.donor_order_id) if donor.donor_order_id is not None else None
        )
        item, _ = _evaluate_option(
            db,
            target_order=target_order,
            donor_plant_id=donor.donor_plant_id,
            donor_plant_name=donor.donor_plant_name,
            donor_order=donor_order,
            quantity=donor.max_donatable_quantity,
            unit_selling_price=1000.0,
            unit_procurement_cost=600.0,
            wait_penalty_per_unit=250.0,
            margin_floor_pct=plan.margin_floor_pct,
            evaluated_at=None,
        )
        alternatives.append(item)

    alternatives.sort(key=lambda o: (not o.is_feasible, -o.net_benefit, o.donor_plant_id))

    logs = list(
        db.execute(
            select(RecoveryAuditLog)
            .where(RecoveryAuditLog.recovery_plan_id == plan.id)
            .order_by(RecoveryAuditLog.created_at.asc(), RecoveryAuditLog.id.asc())
        )
        .scalars()
        .all()
    )
    return plan, alternatives, logs
