"""Routes for inventory event ingestion."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.inventory.ingestion import EventValidationError, ingest_event
from app.schemas.event import (
    EventIngestionResponse,
    InventoryEventCreate,
    InventoryEventResponse,
)

router = APIRouter(tags=["Inventory Events"])


@router.post(
    "/events",
    response_model=EventIngestionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest an inventory event",
    description="Validates and persists an incoming inventory domain event.",
)
def create_inventory_event(
    payload: InventoryEventCreate,
    db: Session = Depends(get_db),
) -> EventIngestionResponse:
    """Validate and persist a single inventory event."""
    try:
        persisted_event = ingest_event(db, payload)
    except EventValidationError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"error": "Event validation failed", "reason": exc.reason},
        ) from exc

    return EventIngestionResponse(
        status="accepted",
        idempotent=False,
        message="Inventory event persisted successfully.",
        event=InventoryEventResponse.model_validate(persisted_event),
    )
