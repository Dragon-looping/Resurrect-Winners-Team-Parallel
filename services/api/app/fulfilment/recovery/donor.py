"""Donor eligibility engine for surplus godown stock and safe order-to-order swaps."""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.production import get_projected_production_supply
from app.fulfilment.recovery.discovery import discover_godown_stock
from app.inventory.engine import normalize_utc
from app.models import CustomerOrder, OrderStatus, RecoveryType


@dataclass(frozen=True, slots=True)
class DonorCandidate:
    """Eligible donor source (surplus stock or swappable order allocation)."""

    recovery_type: RecoveryType
    donor_plant_id: int
    donor_plant_name: str
    donor_order_id: int | None
    donor_order_version: int | None
    donor_stock_version: int
    max_donatable_quantity: int
    reason: str


def find_eligible_donors(
    db: Session,
    target_order: CustomerOrder,
    needed_quantity: int,
) -> list[DonorCandidate]:
    """Identify eligible surplus godown stock and safe order-swap donors."""
    if needed_quantity <= 0:
        return []

    now_utc = datetime.now(timezone.utc)
    godown_views = discover_godown_stock(
        db,
        sku_id=target_order.sku_id,
        as_of=now_utc,
        exclude_plant_id=target_order.plant_id,
    )
    view_by_plant = {v.plant_id: v for v in godown_views}
    candidates: list[DonorCandidate] = []

    # 1. Surplus unreserved stock at other godowns
    for view in godown_views:
        if view.available_stock > 0:
            donatable = min(needed_quantity, view.available_stock)
            candidates.append(
                DonorCandidate(
                    recovery_type=RecoveryType.SURPLUS_TRANSFER,
                    donor_plant_id=view.plant_id,
                    donor_plant_name=view.plant_name,
                    donor_order_id=None,
                    donor_order_version=None,
                    donor_stock_version=view.stock_version,
                    max_donatable_quantity=donatable,
                    reason=(
                        f"{view.plant_name} has {view.available_stock} unreserved units available."
                    ),
                )
            )

    # 2. Safe order-to-order swap donors (only when donor has later deadline + replacement supply)
    target_deadline = normalize_utc(target_order.agreed_delivery_date)
    donor_orders = (
        db.execute(
            select(CustomerOrder).where(
                CustomerOrder.id != target_order.id,
                CustomerOrder.plant_id != target_order.plant_id,
                CustomerOrder.sku_id == target_order.sku_id,
                CustomerOrder.allocated_quantity > 0,
                CustomerOrder.status.in_(
                    [
                        OrderStatus.ALLOCATED.value,
                        OrderStatus.PARTIALLY_ALLOCATED.value,
                        OrderStatus.CONFIRMED.value,
                    ]
                ),
            )
        )
        .scalars()
        .all()
    )

    for donor_order in donor_orders:
        donor_deadline = normalize_utc(donor_order.agreed_delivery_date)
        if donor_deadline <= target_deadline:
            continue

        view = view_by_plant.get(donor_order.plant_id)
        if view is None:
            continue

        replenishment = get_projected_production_supply(
            db, donor_order.plant_id, donor_order.sku_id, donor_deadline
        )
        safe_swap_qty = min(needed_quantity, donor_order.allocated_quantity, replenishment)
        if safe_swap_qty > 0:
            candidates.append(
                DonorCandidate(
                    recovery_type=RecoveryType.ORDER_SWAP,
                    donor_plant_id=donor_order.plant_id,
                    donor_plant_name=view.plant_name,
                    donor_order_id=donor_order.id,
                    donor_order_version=donor_order.version,
                    donor_stock_version=view.stock_version,
                    max_donatable_quantity=safe_swap_qty,
                    reason=(
                        f"Order {donor_order.order_number} at {view.plant_name} can safely donate "
                        f"{safe_swap_qty} units (replenished by {replenishment} units before {donor_deadline.date()})."
                    ),
                )
            )

    return candidates
