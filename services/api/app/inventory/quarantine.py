"""Event quarantine persistence and query services."""

from datetime import date, datetime, time, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import QuarantinedEvent


def _extract_optional_str(payload: dict[str, Any], key: str, max_len: int) -> str | None:
    value = payload.get(key)
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed[:max_len] if trimmed else None
    return None


def quarantine_event(
    db: Session,
    *,
    raw_payload: dict[str, Any],
    failure_reason: str,
    error_details: list[dict[str, Any]] | dict[str, Any] | None = None,
    received_at: datetime | None = None,
) -> QuarantinedEvent:
    """Persist an invalid or malformed event payload to the quarantine table."""
    record = QuarantinedEvent(
        source=_extract_optional_str(raw_payload, "source", 100),
        external_event_id=_extract_optional_str(raw_payload, "external_event_id", 150),
        raw_payload=raw_payload,
        failure_reason=failure_reason,
        error_details=error_details,
        received_at=received_at or datetime.now(timezone.utc),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_quarantined_events(
    db: Session,
    *,
    limit: int = 50,
    offset: int = 0,
    source: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> tuple[list[QuarantinedEvent], int]:
    """Query quarantined events with pagination and optional source/date filters."""
    filters = []
    if source:
        filters.append(QuarantinedEvent.source == source)
    if start_date:
        filters.append(
            QuarantinedEvent.received_at >= datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        )
    if end_date:
        filters.append(
            QuarantinedEvent.received_at <= datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        )

    total = db.execute(
        select(func.count()).select_from(QuarantinedEvent).where(*filters)
    ).scalar_one()

    items = (
        db.execute(
            select(QuarantinedEvent)
            .where(*filters)
            .order_by(QuarantinedEvent.received_at.desc(), QuarantinedEvent.id.desc())
            .offset(offset)
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return list(items), total
