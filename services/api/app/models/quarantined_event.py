"""QuarantinedEvent ORM model for malformed or invalid inventory events."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utcnow() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


class QuarantinedEvent(Base):
    """Stores rejected or malformed event payloads without mutating inventory."""

    __tablename__ = "quarantined_events"
    __table_args__ = (
        Index("ix_quarantined_events_source", "source"),
        Index("ix_quarantined_events_received_at", "received_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    external_event_id: Mapped[str | None] = mapped_column(String(150), nullable=True)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    failure_reason: Mapped[str] = mapped_column(Text, nullable=False)
    error_details: Mapped[list[dict[str, Any]] | dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
        nullable=False,
    )
