"""Multi-godown stock discovery across all plants using the existing inventory engine."""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.production import get_projected_production_supply
from app.inventory.engine import calculate_stock_snapshot, normalize_utc
from app.models import InventoryBalance, InventoryEvent, Plant


@dataclass(frozen=True, slots=True)
class GodownStockView:
    """Stock and production availability snapshot for a single godown/plant."""

    plant_id: int
    plant_name: str
    sku_id: int
    physical_stock: int
    reserved_stock: int
    confirmed_arrivals: int
    available_stock: int
    projected_production_supply: int
    stock_version: int


def discover_godown_stock(
    db: Session,
    *,
    sku_id: int,
    as_of: datetime | None = None,
    exclude_plant_id: int | None = None,
) -> list[GodownStockView]:
    """Discover stock and projected production supply across all godowns for a SKU."""
    now_utc = datetime.now(timezone.utc)
    target_dt = normalize_utc(as_of) if as_of else now_utc

    plants = db.execute(select(Plant).order_by(Plant.id.asc())).scalars().all()
    results: list[GodownStockView] = []

    for plant in plants:
        if exclude_plant_id is not None and plant.id == exclude_plant_id:
            continue

        events = db.execute(
            select(InventoryEvent).where(
                InventoryEvent.plant_id == plant.id,
                InventoryEvent.sku_id == sku_id,
            )
        ).scalars().all()

        snap = calculate_stock_snapshot(
            plant.id,
            sku_id,
            events,
            as_of=target_dt,
            reference_now=now_utc,
            validate_rules=False,
        )
        prod_supply = get_projected_production_supply(db, plant.id, sku_id, target_dt)
        bal = db.execute(
            select(InventoryBalance).where(
                InventoryBalance.plant_id == plant.id,
                InventoryBalance.sku_id == sku_id,
            )
        ).scalar_one_or_none()
        stock_version = (bal.last_event_id or 0) if bal is not None else 0

        results.append(
            GodownStockView(
                plant_id=plant.id,
                plant_name=plant.name,
                sku_id=sku_id,
                physical_stock=snap.physical_stock,
                reserved_stock=snap.reserved_stock,
                confirmed_arrivals=snap.confirmed_arrivals,
                available_stock=snap.available_stock,
                projected_production_supply=prod_supply,
                stock_version=stock_version,
            )
        )

    return results
