"""Routes for inventory event ingestion."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
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
    description="Validates, deduplicates idempotently, and persists an inventory domain event.",
)
def create_inventory_event(
    payload: InventoryEventCreate,
    response: Response,
    db: Session = Depends(get_db),
) -> EventIngestionResponse:
    """Validate and persist a single inventory event idempotently."""
    try:
        persisted_event, is_duplicate = ingest_event(db, payload)
    except EventValidationError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"error": "Event validation failed", "reason": exc.reason},
        ) from exc

    if is_duplicate:
        response.status_code = status.HTTP_200_OK
        return EventIngestionResponse(
            status="duplicate",
            idempotent=True,
            message="Duplicate event ignored idempotently.",
            event=InventoryEventResponse.model_validate(persisted_event),
        )

    return EventIngestionResponse(
        status="accepted",
        idempotent=False,
        message="Inventory event persisted successfully.",
        event=InventoryEventResponse.model_validate(persisted_event),
    )
