"""SQLAlchemy ORM models for godown recovery routes, plans, and audit logs."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import RecoveryStatus, RecoveryType


def utcnow() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


class RecoveryRoute(Base):
    """Inter-godown logistics route with cutoff, transit time, and freight cost."""

    __tablename__ = "recovery_routes"
    __table_args__ = (
        UniqueConstraint("from_plant_id", "to_plant_id", name="uq_recovery_routes_from_to"),
        CheckConstraint("transit_hours >= 0", name="transit_hours_non_negative"),
        CheckConstraint("truck_cutoff_hour_utc >= 0 AND truck_cutoff_hour_utc <= 23", name="cutoff_hour_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False)
    to_plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False)
    transit_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    truck_cutoff_hour_utc: Mapped[int] = mapped_column(Integer, default=16, nullable=False)
    freight_cost_per_unit: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    fixed_dispatch_cost: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )


class RecoveryPlan(Base):
    """Explainable godown recovery preview and human-approved execution record."""

    __tablename__ = "recovery_plans"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="recovery_quantity_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    target_order_id: Mapped[int] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    donor_plant_id: Mapped[int] = mapped_column(
        ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False
    )
    donor_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="SET NULL"), nullable=True
    )
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    recovery_type: Mapped[str] = mapped_column(
        String(30), default=RecoveryType.SURPLUS_TRANSFER.value, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(30), default=RecoveryStatus.PREVIEW.value, nullable=False
    )
    is_feasible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    rejection_reasons: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    wait_cost: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    recovery_cost: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    net_benefit: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    gross_margin_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    margin_floor_pct: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    estimated_delivery_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    target_order_version: Mapped[int] = mapped_column(Integer, nullable=False)
    donor_order_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_stock_version: Mapped[int] = mapped_column(Integer, nullable=False)
    donor_stock_version: Mapped[int] = mapped_column(Integer, nullable=False)
    explanation: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    audit_logs = relationship(
        "RecoveryAuditLog", back_populates="recovery_plan", cascade="all, delete-orphan"
    )


class RecoveryAuditLog(Base):
    """Audit trail for recovery searches, previews, approvals, and rejections."""

    __tablename__ = "recovery_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    recovery_plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("recovery_plans.id", ondelete="CASCADE"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    actor: Mapped[str] = mapped_column(String(100), default="system", nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )

    recovery_plan = relationship("RecoveryPlan", back_populates="audit_logs")
