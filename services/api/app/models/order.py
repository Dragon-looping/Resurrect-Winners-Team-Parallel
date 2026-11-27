"""SQLAlchemy ORM models for customer orders, allocations, production batches, offers, and plans."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import OfferStatus, OrderStatus, PlanStatus, ProductionBatchStatus


def utcnow() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


class CustomerOrder(Base):
    """Customer order with permanent CRD and mutable agreed delivery date."""

    __tablename__ = "customer_orders"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("allocated_quantity >= 0", name="allocated_quantity_non_negative"),
        Index(
            "ix_customer_orders_priority",
            "agreed_delivery_date",
            "created_at",
            "id",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    customer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    allocated_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    customer_request_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    agreed_delivery_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default=OrderStatus.CREATED.value, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, server_default=func.now(), nullable=False
    )

    plant = relationship("Plant")
    sku = relationship("SKU")
    status_history = relationship(
        "OrderStatusHistory", back_populates="order", cascade="all, delete-orphan"
    )
    allocations = relationship(
        "OrderAllocation", back_populates="order", cascade="all, delete-orphan"
    )
    offers = relationship("CustomerOffer", back_populates="order", cascade="all, delete-orphan")
    plans = relationship("OrderPlan", back_populates="order", cascade="all, delete-orphan")


class OrderStatusHistory(Base):
    """Audit trail of order lifecycle status transitions."""

    __tablename__ = "order_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    to_status: Mapped[str] = mapped_column(String(40), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )

    order = relationship("CustomerOrder", back_populates="status_history")


class OrderAllocation(Base):
    """Tracks inventory allocated to a specific customer order."""

    __tablename__ = "order_allocations"
    __table_args__ = (
        CheckConstraint("allocated_quantity > 0", name="order_allocation_qty_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    allocated_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    reservation_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_events.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(30), default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, server_default=func.now(), nullable=False
    )

    order = relationship("CustomerOrder", back_populates="allocations")


class ProductionBatch(Base):
    """Scheduled or active manufacturing batch contributing future supply."""

    __tablename__ = "production_batches"
    __table_args__ = (
        CheckConstraint("planned_quantity > 0", name="planned_quantity_positive"),
        CheckConstraint("completed_quantity >= 0", name="completed_quantity_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    planned_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expected_completion_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=ProductionBatchStatus.PLANNED.value, nullable=False
    )
    required_components: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    components_reserved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    output_counted_in_inventory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, server_default=func.now(), nullable=False
    )


class CustomerOffer(Base):
    """Proposed delivery date / quantity offer sent to a customer."""

    __tablename__ = "customer_offers"
    __table_args__ = (
        CheckConstraint("offered_quantity > 0", name="offered_quantity_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    proposed_delivery_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    offered_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    offer_details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default=OfferStatus.PENDING.value, nullable=False)
    customer_reply_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    order = relationship("CustomerOrder", back_populates="offers")


class OrderPlan(Base):
    """Deterministic fulfillment plan preview and transactional approval record."""

    __tablename__ = "order_plans"
    __table_args__ = (
        CheckConstraint("planned_quantity > 0", name="plan_quantity_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    proposed_delivery_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    planned_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    available_on_date: Mapped[int] = mapped_column(Integer, nullable=False)
    is_feasible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    stock_version: Mapped[int] = mapped_column(Integer, nullable=False)
    order_version: Mapped[int] = mapped_column(Integer, nullable=False)
    plan_details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default=PlanStatus.PREVIEW.value, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    order = relationship("CustomerOrder", back_populates="plans")
