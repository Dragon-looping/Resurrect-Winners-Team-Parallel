"""InventoryBalance projection ORM model."""

from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


class InventoryBalance(Base):
    """Materialized current stock projection per plant and SKU."""

    __tablename__ = "inventory_balances"
    __table_args__ = (
        UniqueConstraint("plant_id", "sku_id", name="uq_inventory_balances_plant_sku"),
        CheckConstraint("physical_stock >= 0", name="physical_stock_non_negative"),
        CheckConstraint("reserved_stock >= 0", name="reserved_stock_non_negative"),
        CheckConstraint("confirmed_arrivals >= 0", name="confirmed_arrivals_non_negative"),
        Index("ix_inventory_balances_plant_sku", "plant_id", "sku_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plants.id", ondelete="RESTRICT"),
        nullable=False,
    )
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="RESTRICT"),
        nullable=False,
    )
    physical_stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved_stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    confirmed_arrivals: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    available_stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_events.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_occurred_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_source_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
        nullable=False,
    )

    plant = relationship("Plant", back_populates="balances")
    sku = relationship("SKU", back_populates="balances")
    last_event = relationship("InventoryEvent")
