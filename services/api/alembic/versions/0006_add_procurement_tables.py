"""Add procurement, purchase order, supplier, email log, and audit tables.

Revision ID: 0006_add_procurement_tables
Revises: 0005_add_godown_recovery_tables
Create Date: 2026-11-27 16:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_add_procurement_tables"
down_revision: Union[str, Sequence[str], None] = "0005_add_godown_recovery_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply procurement schema migration."""
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("supplier_code", sa.String(length=48), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("contact_name", sa.String(length=120), nullable=False),
        sa.Column("contact_email", sa.String(length=200), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=False),
        sa.Column("lead_time_days", sa.Integer(), nullable=False),
        sa.Column("reliability_score", sa.Float(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_suppliers")),
        sa.UniqueConstraint("supplier_code", name=op.f("uq_suppliers_supplier_code")),
    )
    op.create_index(op.f("ix_suppliers_supplier_code"), "suppliers", ["supplier_code"], unique=True)

    op.create_table(
        "supplier_catalog_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("unit_price_inr", sa.Float(), nullable=False),
        sa.Column("min_order_qty", sa.Integer(), nullable=False),
        sa.Column("lead_time_days", sa.Integer(), nullable=False),
        sa.Column("is_preferred", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("unit_price_inr > 0", name=op.f("ck_supplier_catalog_items_unit_price_positive")),
        sa.CheckConstraint("min_order_qty > 0", name=op.f("ck_supplier_catalog_items_min_order_qty_positive")),
        sa.CheckConstraint("lead_time_days >= 0", name=op.f("ck_supplier_catalog_items_lead_time_non_negative")),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], name=op.f("fk_supplier_catalog_items_sku_id_skus"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], name=op.f("fk_supplier_catalog_items_supplier_id_suppliers"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_supplier_catalog_items")),
        sa.UniqueConstraint("supplier_id", "sku_id", name="uq_supplier_catalog_supplier_sku"),
    )
    op.create_index(op.f("ix_supplier_catalog_items_sku_id"), "supplier_catalog_items", ["sku_id"], unique=False)
    op.create_index(op.f("ix_supplier_catalog_items_supplier_id"), "supplier_catalog_items", ["supplier_id"], unique=False)

    op.create_table(
        "purchase_proposals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("proposal_code", sa.String(length=64), nullable=False),
        sa.Column("shortage_ref", sa.String(length=80), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("required_quantity", sa.Integer(), nullable=False),
        sa.Column("available_quantity", sa.Integer(), nullable=False),
        sa.Column("shortage_quantity", sa.Integer(), nullable=False),
        sa.Column("recommended_quantity", sa.Integer(), nullable=False),
        sa.Column("estimated_unit_price", sa.Float(), nullable=False),
        sa.Column("estimated_total_price", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("preferred_supplier_id", sa.Integer(), nullable=False),
        sa.Column("alternative_suppliers", sa.JSON(), nullable=False),
        sa.Column("delivery_requirements", sa.JSON(), nullable=False),
        sa.Column("urgency_level", sa.String(length=24), nullable=False),
        sa.Column("affected_departments", sa.JSON(), nullable=False),
        sa.Column("ai_justification", sa.Text(), nullable=False),
        sa.Column("risk_assessment", sa.Text(), nullable=False),
        sa.Column("historical_case_refs", sa.JSON(), nullable=False),
        sa.Column("ai_execution_mode", sa.String(length=32), nullable=False),
        sa.Column("ai_grounding_notes", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(length=120), nullable=False),
        sa.Column("submitted_by", sa.String(length=120), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", sa.String(length=120), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_by", sa.String(length=120), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("required_quantity > 0", name=op.f("ck_purchase_proposals_proposal_required_qty_positive")),
        sa.CheckConstraint("recommended_quantity > 0", name=op.f("ck_purchase_proposals_proposal_recommended_qty_positive")),
        sa.CheckConstraint("estimated_unit_price > 0", name=op.f("ck_purchase_proposals_proposal_unit_price_positive")),
        sa.CheckConstraint("estimated_total_price > 0", name=op.f("ck_purchase_proposals_proposal_total_price_positive")),
        sa.ForeignKeyConstraint(["order_id"], ["customer_orders.id"], name=op.f("fk_purchase_proposals_order_id_customer_orders"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_purchase_proposals_plant_id_plants"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["preferred_supplier_id"], ["suppliers.id"], name=op.f("fk_purchase_proposals_preferred_supplier_id_suppliers"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], name=op.f("fk_purchase_proposals_sku_id_skus"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_purchase_proposals")),
        sa.UniqueConstraint("proposal_code", name=op.f("uq_purchase_proposals_proposal_code")),
    )
    op.create_index(op.f("ix_purchase_proposals_proposal_code"), "purchase_proposals", ["proposal_code"], unique=True)
    op.create_index(op.f("ix_purchase_proposals_shortage_ref"), "purchase_proposals", ["shortage_ref"], unique=False)
    op.create_index(op.f("ix_purchase_proposals_status"), "purchase_proposals", ["status"], unique=False)

    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("po_number", sa.String(length=64), nullable=False),
        sa.Column("proposal_id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("approved_quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Float(), nullable=False),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("delivery_info", sa.JSON(), nullable=False),
        sa.Column("approval_reference", sa.String(length=120), nullable=False),
        sa.Column("approved_by", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("approved_quantity > 0", name=op.f("ck_purchase_orders_po_approved_qty_positive")),
        sa.CheckConstraint("unit_price > 0", name=op.f("ck_purchase_orders_po_unit_price_positive")),
        sa.CheckConstraint("total_amount > 0", name=op.f("ck_purchase_orders_po_total_amount_positive")),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_purchase_orders_plant_id_plants"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["proposal_id"], ["purchase_proposals.id"], name=op.f("fk_purchase_orders_proposal_id_purchase_proposals"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], name=op.f("fk_purchase_orders_sku_id_skus"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], name=op.f("fk_purchase_orders_supplier_id_suppliers"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_purchase_orders")),
        sa.UniqueConstraint("po_number", name=op.f("uq_purchase_orders_po_number")),
        sa.UniqueConstraint("proposal_id", name="uq_purchase_orders_proposal_id"),
    )
    op.create_index(op.f("ix_purchase_orders_po_number"), "purchase_orders", ["po_number"], unique=True)
    op.create_index(op.f("ix_purchase_orders_status"), "purchase_orders", ["status"], unique=False)

    op.create_table(
        "supplier_email_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("purchase_order_id", sa.Integer(), nullable=False),
        sa.Column("recipient_email", sa.String(length=200), nullable=False),
        sa.Column("recipient_name", sa.String(length=150), nullable=False),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("integration_status", sa.String(length=32), nullable=False),
        sa.Column("delivery_status", sa.String(length=32), nullable=False),
        sa.Column("confirmed_by", sa.String(length=120), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("provider_message_id", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["purchase_order_id"], ["purchase_orders.id"], name=op.f("fk_supplier_email_logs_purchase_order_id_purchase_orders"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_supplier_email_logs")),
    )
    op.create_index(op.f("ix_supplier_email_logs_purchase_order_id"), "supplier_email_logs", ["purchase_order_id"], unique=False)

    op.create_table(
        "procurement_audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.String(length=80), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("actor_id", sa.String(length=120), nullable=False),
        sa.Column("actor_role", sa.String(length=48), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_procurement_audit_logs")),
    )
    op.create_index(op.f("ix_procurement_audit_logs_entity_id"), "procurement_audit_logs", ["entity_id"], unique=False)
    op.create_index(op.f("ix_procurement_audit_logs_entity_type"), "procurement_audit_logs", ["entity_type"], unique=False)


def downgrade() -> None:
    """Revert procurement schema migration."""
    op.drop_index(op.f("ix_procurement_audit_logs_entity_type"), table_name="procurement_audit_logs")
    op.drop_index(op.f("ix_procurement_audit_logs_entity_id"), table_name="procurement_audit_logs")
    op.drop_table("procurement_audit_logs")
    op.drop_index(op.f("ix_supplier_email_logs_purchase_order_id"), table_name="supplier_email_logs")
    op.drop_table("supplier_email_logs")
    op.drop_index(op.f("ix_purchase_orders_status"), table_name="purchase_orders")
    op.drop_index(op.f("ix_purchase_orders_po_number"), table_name="purchase_orders")
    op.drop_table("purchase_orders")
    op.drop_index(op.f("ix_purchase_proposals_status"), table_name="purchase_proposals")
    op.drop_index(op.f("ix_purchase_proposals_shortage_ref"), table_name="purchase_proposals")
    op.drop_index(op.f("ix_purchase_proposals_proposal_code"), table_name="purchase_proposals")
    op.drop_table("purchase_proposals")
    op.drop_index(op.f("ix_supplier_catalog_items_supplier_id"), table_name="supplier_catalog_items")
    op.drop_index(op.f("ix_supplier_catalog_items_sku_id"), table_name="supplier_catalog_items")
    op.drop_table("supplier_catalog_items")
    op.drop_index(op.f("ix_suppliers_supplier_code"), table_name="suppliers")
    op.drop_table("suppliers")
