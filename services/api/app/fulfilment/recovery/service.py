"""Godown recovery search, explainable preview, and lookup services."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.orders import OrderError, get_order_by_id
from app.fulfilment.recovery.costing import evaluate_recovery_economics
from app.fulfilment.recovery.donor import find_eligible_donors
from app.fulfilment.recovery.timeline import evaluate_route_timeline
from app.fulfilment.recovery.validation import validate_recovery_candidate
from app.models import (
    CustomerOrder,
    InventoryBalance,
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
    bal = db.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == plant_id,
            InventoryBalance.sku_id == sku_id,
        )
    ).scalar_one_or_none()
    return (bal.last_event_id or 0) if bal is not None else 0


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


def get_recovery_plan(db: Session, recovery_id: int) -> RecoveryPlan:
    """Fetch a recovery plan by ID or raise OrderError(404)."""
    plan = db.execute(
        select(RecoveryPlan).where(RecoveryPlan.id == recovery_id)
    ).scalar_one_or_none()
    if plan is None:
        raise OrderError(f"Recovery plan with id={recovery_id} not found.", status_code=404)
    return plan
