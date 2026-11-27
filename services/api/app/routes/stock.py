"""Routes for querying current and date-projected inventory stock."""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.inventory.engine import calculate_stock_snapshot
from app.models import InventoryBalance, InventoryEvent, Plant, SKU
from app.schemas.stock import StockItemResponse, StockListResponse

router = APIRouter(tags=["Inventory Stock"])


def _build_stock_item(
    db: Session,
    plant: Plant,
    sku: SKU,
    balance: InventoryBalance | None,
    as_of: date | datetime | None,
) -> StockItemResponse:
    if as_of is not None:
        events = db.execute(
            select(InventoryEvent).where(
                InventoryEvent.plant_id == plant.id,
                InventoryEvent.sku_id == sku.id,
            )
        ).scalars().all()
        snap = calculate_stock_snapshot(
            plant.id,
            sku.id,
            events,
            as_of=as_of,
            validate_rules=False,
        )
        return StockItemResponse(
            plant_id=plant.id,
            plant_name=plant.name,
            sku_id=sku.id,
            sku_code=sku.sku_code,
            sku_name=sku.name,
            unit=sku.unit,
            physical_stock=snap.physical_stock,
            reserved_stock=snap.reserved_stock,
            confirmed_arrivals=snap.confirmed_arrivals,
            available_stock=snap.available_stock,
            last_event_id=snap.last_event_id,
            updated_at=balance.updated_at if balance else None,
        )

    return StockItemResponse(
        plant_id=plant.id,
        plant_name=plant.name,
        sku_id=sku.id,
        sku_code=sku.sku_code,
        sku_name=sku.name,
        unit=sku.unit,
        physical_stock=balance.physical_stock if balance else 0,
        reserved_stock=balance.reserved_stock if balance else 0,
        confirmed_arrivals=balance.confirmed_arrivals if balance else 0,
        available_stock=balance.available_stock if balance else 0,
        last_event_id=balance.last_event_id if balance else None,
        updated_at=balance.updated_at if balance else None,
    )


@router.get(
    "/stock",
    response_model=StockListResponse,
    summary="List stock balances",
    description="Returns physical, reserved, confirmed arrivals, and available stock across plants and SKUs.",
)
def list_stock(
    plant_id: int | None = Query(default=None, gt=0),
    sku_id: int | None = Query(default=None, gt=0),
    as_of: datetime | date | None = Query(default=None, description="Optional date/datetime D for availability projection."),
    db: Session = Depends(get_db),
) -> StockListResponse:
    """List stock balances with optional plant, SKU, and date filters."""
    stmt = (
        select(InventoryBalance, Plant, SKU)
        .join(Plant, InventoryBalance.plant_id == Plant.id)
        .join(SKU, InventoryBalance.sku_id == SKU.id)
        .order_by(Plant.id.asc(), SKU.id.asc())
    )
    if plant_id is not None:
        stmt = stmt.where(InventoryBalance.plant_id == plant_id)
    if sku_id is not None:
        stmt = stmt.where(InventoryBalance.sku_id == sku_id)

    rows = db.execute(stmt).all()
    items = [_build_stock_item(db, plant, sku, bal, as_of) for bal, plant, sku in rows]
    return StockListResponse(count=len(items), items=items)


@router.get(
    "/stock/{plant_id}",
    response_model=StockListResponse,
    summary="Get stock balances for a plant",
    description="Returns stock balances for all SKUs tracked at the specified plant.",
)
def get_stock_by_plant(
    plant_id: int,
    as_of: datetime | date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> StockListResponse:
    """Return stock balances for a specific plant."""
    plant = db.execute(select(Plant).where(Plant.id == plant_id)).scalar_one_or_none()
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant with id={plant_id} not found.",
        )

    rows = db.execute(
        select(InventoryBalance, SKU)
        .join(SKU, InventoryBalance.sku_id == SKU.id)
        .where(InventoryBalance.plant_id == plant_id)
        .order_by(SKU.id.asc())
    ).all()
    items = [_build_stock_item(db, plant, sku, bal, as_of) for bal, sku in rows]
    return StockListResponse(count=len(items), items=items)


@router.get(
    "/stock/{plant_id}/{sku_id}",
    response_model=StockItemResponse,
    summary="Get stock balance for a plant and SKU",
    description="Returns physical, reserved, confirmed arrivals, and available stock for a plant-SKU pair.",
)
def get_stock_by_plant_and_sku(
    plant_id: int,
    sku_id: int,
    as_of: datetime | date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> StockItemResponse:
    """Return stock balance for a specific plant and SKU."""
    plant = db.execute(select(Plant).where(Plant.id == plant_id)).scalar_one_or_none()
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant with id={plant_id} not found.",
        )

    sku = db.execute(select(SKU).where(SKU.id == sku_id)).scalar_one_or_none()
    if sku is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SKU with id={sku_id} not found.",
        )

    balance = db.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == plant_id,
            InventoryBalance.sku_id == sku_id,
        )
    ).scalar_one_or_none()
    return _build_stock_item(db, plant, sku, balance, as_of)
