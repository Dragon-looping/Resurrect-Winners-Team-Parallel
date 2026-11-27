"""Routes for inventory event ingestion and quarantined event inspection."""

from datetime import date, datetime, timezone
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.inventory.ingestion import EventValidationError, ingest_event
from app.inventory.quarantine import list_quarantined_events, quarantine_event
from app.schemas.event import (
    EventIngestionResponse,
    InventoryEventCreate,
    InventoryEventResponse,
    PaginatedQuarantinedEventsResponse,
    QuarantinedEventResponse,
)

router = APIRouter(tags=["Inventory Events"])


def _sanitize_json_errors(errors: list[Any]) -> list[dict[str, Any]]:
    """Convert Pydantic error dictionaries into JSON-serializable structures."""
    sanitized: list[dict[str, Any]] = []
    for err in errors:
        entry = {
            "loc": [str(part) for part in err.get("loc", [])],
            "msg": str(err.get("msg", "")),
            "type": str(err.get("type", "")),
        }
        sanitized.append(entry)
    return sanitized


@router.post(
    "/events",
    response_model=EventIngestionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest an inventory event",
    description="Validates, deduplicates idempotently, and persists an inventory domain event. Invalid payloads are quarantined.",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "schema": InventoryEventCreate.model_json_schema(),
                }
            },
        }
    },
)
async def create_inventory_event(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> EventIngestionResponse:
    """Validate, persist, or quarantine an incoming inventory event."""
    received_at = datetime.now(timezone.utc)
    raw_bytes = await request.body()

    try:
        parsed_json = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        quarantined = quarantine_event(
            db,
            raw_payload={"raw_body": raw_bytes.decode("utf-8", errors="replace")},
            failure_reason=f"Malformed JSON payload: {exc}",
            received_at=received_at,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Event quarantined due to malformed JSON",
                "reason": quarantined.failure_reason,
                "quarantined_event_id": quarantined.id,
            },
        ) from exc

    if not isinstance(parsed_json, dict):
        quarantined = quarantine_event(
            db,
            raw_payload={"raw_value": parsed_json},
            failure_reason="Event payload must be a JSON object.",
            received_at=received_at,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Event quarantined due to invalid payload structure",
                "reason": quarantined.failure_reason,
                "quarantined_event_id": quarantined.id,
            },
        )

    try:
        payload = InventoryEventCreate.model_validate(parsed_json)
    except ValidationError as exc:
        details = _sanitize_json_errors(exc.errors())
        quarantined = quarantine_event(
            db,
            raw_payload=parsed_json,
            failure_reason="Schema validation failed.",
            error_details=details,
            received_at=received_at,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Event quarantined due to schema validation failure",
                "reason": quarantined.failure_reason,
                "details": details,
                "quarantined_event_id": quarantined.id,
            },
        ) from exc

    try:
        persisted_event, is_duplicate = ingest_event(db, payload)
    except EventValidationError as exc:
        quarantined = quarantine_event(
            db,
            raw_payload=parsed_json,
            failure_reason=exc.reason,
            received_at=received_at,
        )
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "error": "Event quarantined due to domain validation failure",
                "reason": exc.reason,
                "quarantined_event_id": quarantined.id,
            },
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


@router.get(
    "/events/quarantined",
    response_model=PaginatedQuarantinedEventsResponse,
    summary="List quarantined events",
    description="Returns invalid or malformed events captured in quarantine.",
)
def get_quarantined_events(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    source: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> PaginatedQuarantinedEventsResponse:
    """List quarantined events with pagination and optional filters."""
    items, total = list_quarantined_events(
        db,
        limit=limit,
        offset=offset,
        source=source,
        start_date=start_date,
        end_date=end_date,
    )
    return PaginatedQuarantinedEventsResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[QuarantinedEventResponse.model_validate(item) for item in items],
    )
