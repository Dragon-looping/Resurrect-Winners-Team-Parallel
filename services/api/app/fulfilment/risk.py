"""Backlog and delivery risk assessment service."""

from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.allocation import order_priority_key
from app.fulfilment.production import get_projected_production_supply
from app.inventory.engine import calculate_stock_snapshot, normalize_utc
from app.inventory.feeds import list_feed_statuses
from app.models import CustomerOrder, InventoryEvent, OrderStatus


class OrderRiskItem(BaseModel):
    """Delivery risk and shortage assessment for a single customer order."""

    order_id: int
    order_number: str
    customer_name: str
    plant_id: int
    sku_id: int
    status: str
    agreed_delivery_date: datetime
    ordered_quantity: int
    allocated_quantity: int
    remaining_quantity: int
    expected_available_on_date: int
    shortage_quantity: int
    at_risk: bool
    feed_is_stale: bool
    risk_classification: str


def assess_backlog_and_risk(
    db: Session,
    *,
    plant_id: int | None = None,
    sku_id: int | None = None,
    only_at_risk: bool = False,
    as_of: datetime | None = None,
) -> list[OrderRiskItem]:
    """Evaluate order backlog, shortages, expected availability, and feed staleness."""
    now_utc = normalize_utc(as_of) if as_of else datetime.now(timezone.utc)
    _, feeds = list_feed_statuses(db, as_of=now_utc)
    any_feed_stale = any(f.is_stale for f in feeds)

    filters = [
        CustomerOrder.status.notin_([OrderStatus.DISPATCHED.value, OrderStatus.CANCELLED.value]),
        CustomerOrder.allocated_quantity < CustomerOrder.quantity,
    ]
    if plant_id is not None:
        filters.append(CustomerOrder.plant_id == plant_id)
    if sku_id is not None:
        filters.append(CustomerOrder.sku_id == sku_id)

    orders = list(db.execute(select(CustomerOrder).where(*filters)).scalars().all())
    orders.sort(key=order_priority_key)

    results: list[OrderRiskItem] = []
    for order in orders:
        remaining = order.quantity - order.allocated_quantity
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
            as_of=normalize_utc(order.agreed_delivery_date),
            reference_now=now_utc,
            validate_rules=False,
        )
        prod_supply = get_projected_production_supply(
            db, order.plant_id, order.sku_id, order.agreed_delivery_date
        )
        expected_avail = max(0, snap.available_stock) + prod_supply
        shortage = max(0, remaining - expected_avail)
        at_risk = shortage > 0

        if any_feed_stale:
            classification = "STALE_FEED_RISK"
        elif at_risk:
            classification = "CONFIRMED_SHORTAGE"
        else:
            classification = "ON_TRACK"

        if only_at_risk and not (at_risk or any_feed_stale):
            continue

        results.append(
            OrderRiskItem(
                order_id=order.id,
                order_number=order.order_number,
                customer_name=order.customer_name,
                plant_id=order.plant_id,
                sku_id=order.sku_id,
                status=order.status,
                agreed_delivery_date=order.agreed_delivery_date,
                ordered_quantity=order.quantity,
                allocated_quantity=order.allocated_quantity,
                remaining_quantity=remaining,
                expected_available_on_date=expected_avail,
                shortage_quantity=shortage,
                at_risk=at_risk,
                feed_is_stale=any_feed_stale,
                risk_classification=classification,
            )
        )
    return results
