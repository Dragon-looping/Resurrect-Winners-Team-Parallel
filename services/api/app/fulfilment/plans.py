"""Deterministic order plan preview and transactional approval."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.allocation import allocate_orders
from app.fulfilment.lifecycle import transition_order_status
from app.fulfilment.orders import OrderError, get_order_by_id
from app.fulfilment.production import get_projected_production_supply
from app.inventory.engine import calculate_stock_snapshot, normalize_utc
from app.models import (
    InventoryBalance,
    InventoryEvent,
    OrderPlan,
    OrderStatus,
    PlanStatus,
)
from app.schemas.plan import OrderPlanCreate


def _get_stock_version(db: Session, plant_id: int, sku_id: int) -> int:
    bal = db.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == plant_id,
            InventoryBalance.sku_id == sku_id,
        )
    ).scalar_one_or_none()
    return (bal.last_event_id or 0) if bal is not None else 0


def generate_order_plan(
    db: Session,
    order_id: int,
    payload: OrderPlanCreate,
) -> OrderPlan:
    """Generate a deterministic plan preview for an order."""
    order = get_order_by_id(db, order_id)
    now_utc = datetime.now(timezone.utc)
    target_date = payload.proposed_delivery_date or normalize_utc(order.agreed_delivery_date)
    planned_qty = payload.planned_quantity or (order.quantity - order.allocated_quantity)
    if planned_qty <= 0:
        planned_qty = order.quantity

    events = db.execute(
        select(InventoryEvent).where(
            InventoryEvent.plant_id == order.plant_id,
            InventoryEvent.sku_id == order.sku_id,
        )
    ).scalars().all()
    snap = calculate_stock_snapshot(
        order.plant_id,
        order.sku_id,
        events,
        as_of=target_date,
        reference_now=now_utc,
        validate_rules=False,
    )
    prod_supply = get_projected_production_supply(db, order.plant_id, order.sku_id, target_date)
    available_on_date = max(0, snap.available_stock) + prod_supply
    is_feasible = available_on_date >= planned_qty

    plan = OrderPlan(
        order_id=order.id,
        proposed_delivery_date=target_date,
        planned_quantity=planned_qty,
        available_on_date=available_on_date,
        is_feasible=is_feasible,
        stock_version=_get_stock_version(db, order.plant_id, order.sku_id),
        order_version=order.version,
        plan_details={
            "inventory_available": max(0, snap.available_stock),
            "production_supply": prod_supply,
            "shortage": max(0, planned_qty - available_on_date),
        },
        status=PlanStatus.PREVIEW.value,
        created_at=now_utc,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def approve_order_plan(db: Session, plan_id: int) -> OrderPlan:
    """Revalidate stock/order versions and feasibility, then approve transactionally."""
    plan = db.execute(select(OrderPlan).where(OrderPlan.id == plan_id)).scalar_one_or_none()
    if plan is None:
        raise OrderError(f"Order plan with id={plan_id} not found.", status_code=404)

    if plan.status != PlanStatus.PREVIEW.value:
        raise OrderError(f"Plan id={plan_id} is already {plan.status.lower()}.", status_code=409)

    if not plan.is_feasible:
        raise OrderError(
            "Cannot approve an infeasible order plan; insufficient projected supply.",
            status_code=422,
        )

    order = get_order_by_id(db, plan.order_id)
    if order.version != plan.order_version:
        raise OrderError(
            "Order has changed since plan preview; regenerate plan before approving.",
            status_code=409,
        )

    current_stock_version = _get_stock_version(db, order.plant_id, order.sku_id)
    if current_stock_version != plan.stock_version:
        raise OrderError(
            "Inventory stock has changed since plan preview; regenerate plan before approving.",
            status_code=409,
        )

    now_utc = datetime.now(timezone.utc)
    try:
        order.agreed_delivery_date = plan.proposed_delivery_date
        if order.status in {OrderStatus.CREATED.value, OrderStatus.BACKLOGGED.value, OrderStatus.OFFER_SENT.value}:
            transition_order_status(
                db,
                order,
                OrderStatus.CONFIRMED,
                reason=f"Order plan id={plan.id} approved.",
                commit=False,
            )
        plan.status = PlanStatus.APPROVED.value
        plan.approved_at = now_utc
        db.flush()
    except Exception:
        db.rollback()
        raise

    allocate_orders(db, order_id=order.id)
    db.refresh(plan)
    return plan
