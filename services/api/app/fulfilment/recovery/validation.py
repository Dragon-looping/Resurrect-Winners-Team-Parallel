"""Swap and transfer feasibility validation for godown recovery."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.production import get_projected_production_supply
from app.inventory.engine import calculate_stock_snapshot, normalize_utc
from app.models import CustomerOrder, InventoryEvent, OrderStatus


def validate_recovery_candidate(
    db: Session,
    *,
    target_order: CustomerOrder,
    donor_plant_id: int,
    quantity: int,
    donor_order: CustomerOrder | None = None,
) -> list[str]:
    """Validate SKU, quantity, negative-stock prevention, and donor order safety."""
    reasons: list[str] = []

    if quantity <= 0:
        reasons.append("Recovery quantity must be greater than 0.")
        return reasons

    if target_order.status in {OrderStatus.DISPATCHED.value, OrderStatus.CANCELLED.value}:
        reasons.append(f"Target order is in terminal status {target_order.status}.")

    remaining = target_order.quantity - target_order.allocated_quantity
    if quantity > remaining:
        reasons.append(
            f"Requested recovery quantity ({quantity}) exceeds target order remaining need ({remaining})."
        )

    if donor_plant_id == target_order.plant_id:
        reasons.append("Donor plant must differ from target order plant.")

    now_utc = datetime.now(timezone.utc)

    if donor_order is not None:
        if donor_order.id == target_order.id:
            reasons.append("Donor order cannot be the same as target order.")
        if donor_order.plant_id != donor_plant_id:
            reasons.append("Donor order does not belong to the specified donor plant.")
        if donor_order.sku_id != target_order.sku_id:
            reasons.append("Donor order SKU does not match target order SKU.")
        if donor_order.allocated_quantity < quantity:
            reasons.append(
                f"Donor order only has {donor_order.allocated_quantity} allocated units; cannot donate {quantity}."
            )
        if normalize_utc(donor_order.agreed_delivery_date) <= normalize_utc(target_order.agreed_delivery_date):
            reasons.append("Swap rejected: donor order delivery date is not later than target order.")

        replenishment = get_projected_production_supply(
            db, donor_plant_id, target_order.sku_id, donor_order.agreed_delivery_date
        )
        if replenishment < quantity:
            reasons.append(
                f"Swap rejected: donor plant replenishment ({replenishment}) is less than {quantity}, which would make donor order late."
            )
    else:
        events = db.execute(
            select(InventoryEvent).where(
                InventoryEvent.plant_id == donor_plant_id,
                InventoryEvent.sku_id == target_order.sku_id,
            )
        ).scalars().all()
        snap = calculate_stock_snapshot(
            donor_plant_id,
            target_order.sku_id,
            events,
            as_of=now_utc,
            reference_now=now_utc,
            validate_rules=False,
        )
        if snap.available_stock < quantity:
            reasons.append(
                f"Insufficient unreserved stock at donor plant: available={snap.available_stock}, requested={quantity}."
            )

    return reasons
