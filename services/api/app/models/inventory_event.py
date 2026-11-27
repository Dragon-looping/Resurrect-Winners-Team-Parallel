"""InventoryEvent ORM model."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


class InventoryEvent(Base):
    """Immutable persisted inventory domain event."""

    __tablename__ = "inventory_events"
    __table_args__ = (
        UniqueConstraint(
            "source",
            "external_event_id",
            name="uq_inventory_events_source_external_event_id",
        ),
        CheckConstraint(
            "source_sequence >= 0",
            name="source_sequence_non_negative",
        ),
        Index(
            "ix_inventory_events_replay_order",
            "plant_id",
            "sku_id",
            "occurred_at",
            "source_sequence",
            "id",
        ),
        Index("ix_inventory_events_event_type", "event_type"),
        Index("ix_inventory_events_occurred_at", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    external_event_id: Mapped[str] = mapped_column(String(150), nullable=False)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plants.id", ondelete="RESTRICT"),
        nullable=False,
    )
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="RESTRICT"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    source_sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
        nullable=False,
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSON,
        default=dict,
        nullable=False,
    )

    plant = relationship("Plant", back_populates="events")
    sku = relationship("SKU", back_populates="events")
