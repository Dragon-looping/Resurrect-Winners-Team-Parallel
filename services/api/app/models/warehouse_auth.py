"""SQLAlchemy models for warehouse authentication, inter-warehouse requests, and audit logs."""

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import InterWarehouseRequestStatus, WarehouseUserRole


class WarehouseUser(Base):
    """Authenticated warehouse operator account scoped to a single plant."""

    __tablename__ = "warehouse_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    login_id: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    role: Mapped[WarehouseUserRole] = mapped_column(
        SAEnum(WarehouseUserRole, name="warehouse_user_role"),
        nullable=False,
        default=WarehouseUserRole.WAREHOUSE_USER,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    plant = relationship("Plant")


class InterWarehouseRequest(Base):
    """Inter-warehouse stock transfer request between a requesting and supplying plant."""

    __tablename__ = "inter_warehouse_requests"
    __table_args__ = (
        CheckConstraint(
            "requesting_plant_id <> supplying_plant_id",
            name="ck_iwr_different_plants",
        ),
        CheckConstraint("requested_qty > 0", name="ck_iwr_requested_qty_positive"),
        Index("ix_iwr_requesting_status", "requesting_plant_id", "status"),
        Index("ix_iwr_supplying_status", "supplying_plant_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    idempotency_key: Mapped[str | None] = mapped_column(
        String(120), nullable=True, unique=True, index=True
    )
    requesting_plant_id: Mapped[int] = mapped_column(
        ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False
    )
    supplying_plant_id: Mapped[int] = mapped_column(
        ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False
    )
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False
    )
    requested_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    approved_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dispatched_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    received_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[InterWarehouseRequestStatus] = mapped_column(
        SAEnum(InterWarehouseRequestStatus, name="inter_warehouse_request_status"),
        nullable=False,
        default=InterWarehouseRequestStatus.PENDING,
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("warehouse_users.id", ondelete="RESTRICT"), nullable=False
    )
    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouse_users.id", ondelete="RESTRICT"), nullable=True
    )
    dispatch_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_events.id", ondelete="SET NULL"), nullable=True
    )
    receipt_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_events.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    requesting_plant = relationship("Plant", foreign_keys=[requesting_plant_id])
    supplying_plant = relationship("Plant", foreign_keys=[supplying_plant_id])
    sku = relationship("SKU")


class WarehouseAuditLog(Base):
    """Immutable audit trail for authentication, authorization, and inter-warehouse actions."""

    __tablename__ = "warehouse_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("warehouse_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_login_id: Mapped[str] = mapped_column(String(80), nullable=False)
    plant_id: Mapped[int | None] = mapped_column(
        ForeignKey("plants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    details_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
