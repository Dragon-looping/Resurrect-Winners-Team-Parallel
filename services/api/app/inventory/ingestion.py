"""Inventory event ingestion service and domain exceptions."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import InventoryEvent, Plant, SKU
from app.schemas.event import InventoryEventCreate


class EventValidationError(Exception):
    """Raised when an incoming event fails domain or reference validation."""

    def __init__(self, reason: str, status_code: int = 422) -> None:
        super().__init__(reason)
        self.reason = reason
        self.status_code = status_code


def ensure_plant_and_sku_exist(db: Session, plant_id: int, sku_id: int) -> tuple[Plant, SKU]:
    """Validate that both referenced plant and SKU records exist in the database."""
    plant = db.execute(select(Plant).where(Plant.id == plant_id)).scalar_one_or_none()
    if plant is None:
        raise EventValidationError(f"Plant with id={plant_id} does not exist.", status_code=422)

    sku = db.execute(select(SKU).where(SKU.id == sku_id)).scalar_one_or_none()
    if sku is None:
        raise EventValidationError(f"SKU with id={sku_id} does not exist.", status_code=422)

    return plant, sku


def find_existing_event(
    db: Session,
    source: str,
    external_event_id: str,
) -> InventoryEvent | None:
    """Look up an already-persisted event by its idempotency key (source, external_event_id)."""
    stmt = select(InventoryEvent).where(
        InventoryEvent.source == source,
        InventoryEvent.external_event_id == external_event_id,
    )
    return db.execute(stmt).scalar_one_or_none()


def ingest_event(db: Session, payload: InventoryEventCreate) -> tuple[InventoryEvent, bool]:
    """Validate, deduplicate idempotently, and persist an inventory event.

    Returns a tuple of (event, is_duplicate).
    """
    existing = find_existing_event(db, payload.source, payload.external_event_id)
    if existing is not None:
        return existing, True

    ensure_plant_and_sku_exist(db, payload.plant_id, payload.sku_id)

    event = InventoryEvent(
        source=payload.source,
        external_event_id=payload.external_event_id,
        plant_id=payload.plant_id,
        sku_id=payload.sku_id,
        event_type=payload.event_type.value,
        quantity=payload.quantity,
        source_sequence=payload.source_sequence,
        occurred_at=payload.occurred_at,
        received_at=datetime.now(timezone.utc),
        metadata_json=dict(payload.metadata),
    )
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        concurrent_existing = find_existing_event(db, payload.source, payload.external_event_id)
        if concurrent_existing is not None:
            return concurrent_existing, True
        raise

    db.refresh(event)
    return event, False
