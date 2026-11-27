"""Deterministic stock balance and reservation calculation engine."""

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InventoryBalance, InventoryEvent, InventoryEventType


class StockCalculationError(Exception):
    """Raised when an event violates stock balance or reservation business rules."""

    def __init__(self, reason: str, status_code: int = 422) -> None:
        super().__init__(reason)
        self.reason = reason
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class StockSnapshot:
    """Calculated inventory stock metrics for a plant and SKU."""

    plant_id: int
    sku_id: int
    physical_stock: int
    reserved_stock: int
    confirmed_arrivals: int
    available_stock: int
    last_event_id: int | None
    last_occurred_at: datetime | None
    last_source_sequence: int | None


def normalize_utc(value: datetime) -> datetime:
    """Normalize a datetime (naive or aware) into timezone-aware UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def resolve_as_of_datetime(as_of: date | datetime) -> datetime:
    """Convert a date or datetime cutoff D into an end-of-day/exact UTC datetime."""
    if isinstance(as_of, datetime):
        return normalize_utc(as_of)
    return datetime.combine(as_of, time(23, 59, 59, 999999), tzinfo=timezone.utc)


def event_sort_key(event: InventoryEvent) -> tuple[datetime, int, int]:
    """Deterministic ordering key for inventory events."""
    return (normalize_utc(event.occurred_at), event.source_sequence, event.id)


def _is_confirmed_arrival(event: InventoryEvent, physical_cutoff: datetime) -> bool:
    """Return True if a STOCK_RECEIVED event represents a future confirmed arrival."""
    if event.event_type != InventoryEventType.STOCK_RECEIVED.value:
        return False
    metadata = event.metadata_json or {}
    if metadata.get("confirmed_arrival") is True:
        return True
    return normalize_utc(event.occurred_at) > physical_cutoff


def calculate_stock_snapshot(
    plant_id: int,
    sku_id: int,
    events: Sequence[InventoryEvent],
    *,
    as_of: date | datetime | None = None,
    reference_now: datetime | None = None,
    validate_rules: bool = True,
) -> StockSnapshot:
    """Compute stock snapshot from events ordered deterministically.

    Formula:
        Available stock = Physical stock + confirmed arrivals by D - allocated/reserved units by D
    """
    physical_cutoff = normalize_utc(reference_now or datetime.now(timezone.utc))
    cutoff_dt = resolve_as_of_datetime(as_of) if as_of is not None else None

    ordered = sorted(events, key=event_sort_key)

    physical_stock = 0
    reserved_stock = 0
    confirmed_arrivals = 0
    last_event: InventoryEvent | None = None

    for event in ordered:
        occurred_utc = normalize_utc(event.occurred_at)
        if cutoff_dt is not None and occurred_utc > cutoff_dt:
            continue

        event_type = event.event_type
        qty = event.quantity

        if event_type == InventoryEventType.STOCK_RECEIVED.value:
            if _is_confirmed_arrival(event, physical_cutoff):
                confirmed_arrivals += qty
            else:
                physical_stock += qty

        elif event_type == InventoryEventType.STOCK_DISPATCHED.value:
            if validate_rules and physical_stock - qty < 0:
                raise StockCalculationError(
                    f"Insufficient physical stock for dispatch: available={physical_stock}, requested={qty}."
                )
            physical_stock = max(0, physical_stock - qty) if not validate_rules else physical_stock - qty

        elif event_type == InventoryEventType.PHYSICAL_COUNT.value:
            if validate_rules and qty < 0:
                raise StockCalculationError("Physical count cannot be negative.")
            physical_stock = qty

        elif event_type == InventoryEventType.STOCK_RESERVED.value:
            current_available = physical_stock + confirmed_arrivals - reserved_stock
            if validate_rules and qty > current_available:
                raise StockCalculationError(
                    f"Insufficient available stock for reservation: available={current_available}, requested={qty}."
                )
            reserved_stock += qty

        elif event_type == InventoryEventType.STOCK_RELEASED.value:
            if validate_rules and reserved_stock - qty < 0:
                raise StockCalculationError(
                    f"Cannot release more stock than reserved: reserved={reserved_stock}, requested={qty}."
                )
            reserved_stock = max(0, reserved_stock - qty) if not validate_rules else reserved_stock - qty

        elif event_type == InventoryEventType.STOCK_ADJUSTED.value:
            if validate_rules and physical_stock + qty < 0:
                raise StockCalculationError(
                    f"Adjustment would result in negative physical stock: physical={physical_stock}, delta={qty}."
                )
            physical_stock = max(0, physical_stock + qty) if not validate_rules else physical_stock + qty

        else:
            raise StockCalculationError(f"Unsupported event_type={event_type}.")

        last_event = event

    available_stock = physical_stock + confirmed_arrivals - reserved_stock

    return StockSnapshot(
        plant_id=plant_id,
        sku_id=sku_id,
        physical_stock=physical_stock,
        reserved_stock=reserved_stock,
        confirmed_arrivals=confirmed_arrivals,
        available_stock=available_stock,
        last_event_id=last_event.id if last_event else None,
        last_occurred_at=normalize_utc(last_event.occurred_at) if last_event else None,
        last_source_sequence=last_event.source_sequence if last_event else None,
    )


def recompute_balance_for_pair(
    db: Session,
    plant_id: int,
    sku_id: int,
    *,
    reference_now: datetime | None = None,
    validate_rules: bool = True,
) -> InventoryBalance:
    """Recompute and upsert the InventoryBalance projection for (plant_id, sku_id)."""
    events = db.execute(
        select(InventoryEvent).where(
            InventoryEvent.plant_id == plant_id,
            InventoryEvent.sku_id == sku_id,
        )
    ).scalars().all()

    snapshot = calculate_stock_snapshot(
        plant_id,
        sku_id,
        events,
        reference_now=reference_now,
        validate_rules=validate_rules,
    )

    balance = db.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == plant_id,
            InventoryBalance.sku_id == sku_id,
        )
    ).scalar_one_or_none()

    now_utc = datetime.now(timezone.utc)
    if balance is None:
        balance = InventoryBalance(
            plant_id=plant_id,
            sku_id=sku_id,
            physical_stock=snapshot.physical_stock,
            reserved_stock=snapshot.reserved_stock,
            confirmed_arrivals=snapshot.confirmed_arrivals,
            available_stock=snapshot.available_stock,
            last_event_id=snapshot.last_event_id,
            last_occurred_at=snapshot.last_occurred_at,
            last_source_sequence=snapshot.last_source_sequence,
            updated_at=now_utc,
        )
        db.add(balance)
    else:
        balance.physical_stock = snapshot.physical_stock
        balance.reserved_stock = snapshot.reserved_stock
        balance.confirmed_arrivals = snapshot.confirmed_arrivals
        balance.available_stock = snapshot.available_stock
        balance.last_event_id = snapshot.last_event_id
        balance.last_occurred_at = snapshot.last_occurred_at
        balance.last_source_sequence = snapshot.last_source_sequence
        balance.updated_at = now_utc

    db.flush()
    return balance
