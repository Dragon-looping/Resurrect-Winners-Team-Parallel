"""Inventory event ingestion service and domain exceptions."""

from datetime import datetime, timezone

from sqlalchemy import select
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


def ingest_event(db: Session, payload: InventoryEventCreate) -> InventoryEvent:
    """Validate references and persist an inventory event before acknowledging."""
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
    db.commit()
    db.refresh(event)
    return event
