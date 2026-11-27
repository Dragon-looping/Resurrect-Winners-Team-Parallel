"""Priority-based inventory allocation engine integrated with inventory reservations."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.fulfilment.lifecycle import transition_order_status
from app.inventory.engine import (
    calculate_stock_snapshot,
    normalize_utc,
    recompute_balance_for_pair,
)
from app.models import (
    CustomerOrder,
    InventoryEvent,
    InventoryEventType,
    OrderAllocation,
    OrderStatus,
)

ALLOCATABLE_STATUSES = {
    OrderStatus.CREATED.value,
    OrderStatus.PARTIALLY_ALLOCATED.value,
    OrderStatus.BACKLOGGED.value,
    OrderStatus.CONFIRMED.value,
}


def order_priority_key(order: CustomerOrder) -> tuple[datetime, datetime, int]:
    """Sort orders by earliest agreed delivery deadline, then created_at, then id."""
    return (
        normalize_utc(order.agreed_delivery_date),
        normalize_utc(order.created_at),
        order.id,
    )


def _next_source_sequence(db: Session, source: str) -> int:
    current_max = db.execute(
        select(func.max(InventoryEvent.source_sequence)).where(InventoryEvent.source == source)
    ).scalar_one()
    return (current_max or 0) + 1


def allocate_orders(
    db: Session,
    *,
    plant_id: int | None = None,
    sku_id: int | None = None,
    order_id: int | None = None,
) -> list[CustomerOrder]:
    """Allocate available inventory to eligible orders in deterministic priority order."""
    filters = [
        CustomerOrder.status.in_(ALLOCATABLE_STATUSES),
        CustomerOrder.allocated_quantity < CustomerOrder.quantity,
    ]
    if plant_id is not None:
        filters.append(CustomerOrder.plant_id == plant_id)
    if sku_id is not None:
        filters.append(CustomerOrder.sku_id == sku_id)
    if order_id is not None:
        filters.append(CustomerOrder.id == order_id)

    orders = list(db.execute(select(CustomerOrder).where(*filters)).scalars().all())
    orders.sort(key=order_priority_key)

    now_utc = datetime.now(timezone.utc)
    updated_orders: list[CustomerOrder] = []

    for order in orders:
        remaining = order.quantity - order.allocated_quantity
        if remaining <= 0:
            continue

        events = db.execute(
            select(InventoryEvent).where(
                InventoryEvent.plant_id == order.plant_id,
                InventoryEvent.sku_id == order.sku_id,
            )
        ).scalars().all()

        snapshot = calculate_stock_snapshot(
            order.plant_id,
            order.sku_id,
            events,
            as_of=normalize_utc(order.agreed_delivery_date),
            reference_now=now_utc,
            validate_rules=False,
        )

        alloc_qty = min(remaining, max(0, snapshot.available_stock))
        if alloc_qty > 0:
            seq = _next_source_sequence(db, "order-lifecycle")
            reserve_event = InventoryEvent(
                source="order-lifecycle",
                external_event_id=f"alloc-{order.id}-{uuid4().hex[:12]}",
                plant_id=order.plant_id,
                sku_id=order.sku_id,
                event_type=InventoryEventType.STOCK_RESERVED.value,
                quantity=alloc_qty,
                source_sequence=seq,
                occurred_at=now_utc,
                received_at=now_utc,
                metadata_json={"order_id": order.id, "order_number": order.order_number},
            )
            db.add(reserve_event)
            db.flush()

            recompute_balance_for_pair(
                db,
                order.plant_id,
                order.sku_id,
                reference_now=now_utc,
                validate_rules=True,
            )

            db.add(
                OrderAllocation(
                    order_id=order.id,
                    plant_id=order.plant_id,
                    sku_id=order.sku_id,
                    allocated_quantity=alloc_qty,
                    reservation_event_id=reserve_event.id,
                    status="ACTIVE",
                    created_at=now_utc,
                    updated_at=now_utc,
                )
            )
            order.allocated_quantity += alloc_qty
            target_status = (
                OrderStatus.ALLOCATED
                if order.allocated_quantity >= order.quantity
                else OrderStatus.PARTIALLY_ALLOCATED
            )
            transition_order_status(
                db,
                order,
                target_status,
                reason=f"Allocated {alloc_qty} units from available inventory.",
                commit=False,
            )
        elif order.allocated_quantity == 0 and order.status == OrderStatus.CREATED.value:
            transition_order_status(
                db,
                order,
                OrderStatus.BACKLOGGED,
                reason="Insufficient available stock for allocation.",
                commit=False,
            )

        updated_orders.append(order)

    db.commit()
    for order in updated_orders:
        db.refresh(order)
    return updated_orders


def release_order_allocations(
    db: Session,
    order: CustomerOrder,
    *,
    reason: str = "Order allocation released",
) -> CustomerOrder:
    """Release all active inventory allocations for an order back to available stock."""
    active_allocs = list(
        db.execute(
            select(OrderAllocation).where(
                OrderAllocation.order_id == order.id,
                OrderAllocation.status == "ACTIVE",
            )
        )
        .scalars()
        .all()
    )
    if not active_allocs:
        return order

    total_release = sum(a.allocated_quantity for a in active_allocs)
    now_utc = datetime.now(timezone.utc)
    seq = _next_source_sequence(db, "order-lifecycle")
    release_event = InventoryEvent(
        source="order-lifecycle",
        external_event_id=f"release-{order.id}-{uuid4().hex[:12]}",
        plant_id=order.plant_id,
        sku_id=order.sku_id,
        event_type=InventoryEventType.STOCK_RELEASED.value,
        quantity=total_release,
        source_sequence=seq,
        occurred_at=now_utc,
        received_at=now_utc,
        metadata_json={"order_id": order.id, "order_number": order.order_number},
    )
    db.add(release_event)
    db.flush()

    recompute_balance_for_pair(
        db,
        order.plant_id,
        order.sku_id,
        reference_now=now_utc,
        validate_rules=True,
    )

    for alloc in active_allocs:
        alloc.status = "RELEASED"
        alloc.updated_at = now_utc

    order.allocated_quantity = 0
    if order.status not in {OrderStatus.CANCELLED.value, OrderStatus.DISPATCHED.value}:
        transition_order_status(
            db,
            order,
            OrderStatus.BACKLOGGED,
            reason=reason,
            commit=False,
        )

    db.commit()
    db.refresh(order)
    return order
