"""SQLAlchemy ORM models for SETUVYUHA Procurement, Approvals, POs, Emails, and Audits."""

from __future__ import annotations

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
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import EmailDeliveryStatus, ProposalStatus, PurchaseOrderStatus


def utcnow() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


class Supplier(Base):
    """Verified supplier master record with real contact details."""

    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    supplier_code: Mapped[str] = mapped_column(String(48), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(120), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    reliability_score: Mapped[float] = mapped_column(Float, default=0.95, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )

    catalog_items = relationship("SupplierCatalogItem", back_populates="supplier", cascade="all, delete-orphan")


class SupplierCatalogItem(Base):
    """Verified supplier-to-SKU pricing, MOQ, and lead-time catalog entry."""

    __tablename__ = "supplier_catalog_items"
    __table_args__ = (
        UniqueConstraint("supplier_id", "sku_id", name="uq_supplier_catalog_supplier_sku"),
        CheckConstraint("unit_price_inr > 0", name="unit_price_positive"),
        CheckConstraint("min_order_qty > 0", name="min_order_qty_positive"),
        CheckConstraint("lead_time_days >= 0", name="lead_time_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id", ondelete="CASCADE"), nullable=False, index=True)
    unit_price_inr: Mapped[float] = mapped_column(Float, nullable=False)
    min_order_qty: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    is_preferred: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )

    supplier = relationship("Supplier", back_populates="catalog_items")
    sku = relationship("SKU")


class PurchaseProposal(Base):
    """AI-assisted purchase proposal grounded in shortage data and verified supplier catalog."""

    __tablename__ = "purchase_proposals"
    __table_args__ = (
        CheckConstraint("required_quantity > 0", name="proposal_required_qty_positive"),
        CheckConstraint("recommended_quantity > 0", name="proposal_recommended_qty_positive"),
        CheckConstraint("estimated_unit_price > 0", name="proposal_unit_price_positive"),
        CheckConstraint("estimated_total_price > 0", name="proposal_total_price_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proposal_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    shortage_ref: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)

    required_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    available_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    shortage_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    recommended_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    estimated_unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    estimated_total_price: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)

    preferred_supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False
    )
    alternative_suppliers: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    delivery_requirements: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    urgency_level: Mapped[str] = mapped_column(String(24), nullable=False)
    affected_departments: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    ai_justification: Mapped[str] = mapped_column(Text, nullable=False)
    risk_assessment: Mapped[str] = mapped_column(Text, nullable=False)
    historical_case_refs: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    ai_execution_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    ai_grounding_notes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    status: Mapped[str] = mapped_column(String(32), default=ProposalStatus.DRAFT.value, nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    created_by: Mapped[str] = mapped_column(String(120), nullable=False)
    submitted_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, server_default=func.now(), nullable=False
    )

    preferred_supplier = relationship("Supplier")
    plant = relationship("Plant")
    sku = relationship("SKU")
    purchase_order = relationship("PurchaseOrder", back_populates="proposal", uselist=False)


class PurchaseOrder(Base):
    """Formal Purchase Order generated strictly from an approved PurchaseProposal."""

    __tablename__ = "purchase_orders"
    __table_args__ = (
        UniqueConstraint("proposal_id", name="uq_purchase_orders_proposal_id"),
        CheckConstraint("approved_quantity > 0", name="po_approved_qty_positive"),
        CheckConstraint("unit_price > 0", name="po_unit_price_positive"),
        CheckConstraint("total_amount > 0", name="po_total_amount_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    po_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    proposal_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_proposals.id", ondelete="RESTRICT"), nullable=False
    )
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plants.id", ondelete="RESTRICT"), nullable=False)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id", ondelete="RESTRICT"), nullable=False)

    approved_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    delivery_info: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    approval_reference: Mapped[str] = mapped_column(String(120), nullable=False)
    approved_by: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=PurchaseOrderStatus.CREATED.value, nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, server_default=func.now(), nullable=False
    )

    proposal = relationship("PurchaseProposal", back_populates="purchase_order")
    supplier = relationship("Supplier")
    plant = relationship("Plant")
    sku = relationship("SKU")
    email_logs = relationship("SupplierEmailLog", back_populates="purchase_order", cascade="all, delete-orphan")


class SupplierEmailLog(Base):
    """Audit log of supplier PO email previews, human confirmations, and delivery attempts."""

    __tablename__ = "supplier_email_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recipient_email: Mapped[str] = mapped_column(String(200), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(150), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    integration_status: Mapped[str] = mapped_column(String(32), nullable=False)
    delivery_status: Mapped[str] = mapped_column(
        String(32), default=EmailDeliveryStatus.PREVIEWED.value, nullable=False
    )
    confirmed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )

    purchase_order = relationship("PurchaseOrder", back_populates="email_logs")


class ProcurementAuditLog(Base):
    """Immutable audit trail for all procurement, approval, PO, email, and briefing events."""

    __tablename__ = "procurement_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(120), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(48), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False
    )
