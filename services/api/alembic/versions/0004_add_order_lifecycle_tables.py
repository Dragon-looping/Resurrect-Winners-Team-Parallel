"""Add order lifecycle tables: customer_orders, order_status_history, order_allocations, production_batches, customer_offers, order_plans.

Revision ID: 0004_add_order_lifecycle_tables
Revises: 0003_add_feed_health
Create Date: 2026-11-27 14:43:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_add_order_lifecycle_tables"
down_revision: Union[str, Sequence[str], None] = "0003_add_feed_health"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply migration changes."""
    op.create_table(
        "customer_orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_number", sa.String(length=64), nullable=False),
        sa.Column("customer_name", sa.String(length=150), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("allocated_quantity", sa.Integer(), nullable=False),
        sa.Column("customer_request_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("agreed_delivery_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_customer_orders_quantity_positive")),
        sa.CheckConstraint("allocated_quantity >= 0", name=op.f("ck_customer_orders_allocated_quantity_non_negative")),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_customer_orders_plant_id_plants"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], name=op.f("fk_customer_orders_sku_id_skus"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_orders")),
        sa.UniqueConstraint("order_number", name=op.f("uq_customer_orders_order_number")),
    )
    op.create_index(op.f("ix_customer_orders_order_number"), "customer_orders", ["order_number"], unique=True)
    op.create_index("ix_customer_orders_priority", "customer_orders", ["agreed_delivery_date", "created_at", "id"], unique=False)

    op.create_table(
        "order_status_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("from_status", sa.String(length=40), nullable=True),
        sa.Column("to_status", sa.String(length=40), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["customer_orders.id"], name=op.f("fk_order_status_history_order_id_customer_orders"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_status_history")),
    )
    op.create_index(op.f("ix_order_status_history_order_id"), "order_status_history", ["order_id"], unique=False)

    op.create_table(
        "order_allocations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("allocated_quantity", sa.Integer(), nullable=False),
        sa.Column("reservation_event_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("allocated_quantity > 0", name=op.f("ck_order_allocations_order_allocation_qty_positive")),
        sa.ForeignKeyConstraint(["order_id"], ["customer_orders.id"], name=op.f("fk_order_allocations_order_id_customer_orders"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_order_allocations_plant_id_plants"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reservation_event_id"], ["inventory_events.id"], name=op.f("fk_order_allocations_reservation_event_id_inventory_events"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], name=op.f("fk_order_allocations_sku_id_skus"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_allocations")),
    )
    op.create_index(op.f("ix_order_allocations_order_id"), "order_allocations", ["order_id"], unique=False)

    op.create_table(
        "production_batches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("batch_code", sa.String(length=64), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("planned_quantity", sa.Integer(), nullable=False),
        sa.Column("completed_quantity", sa.Integer(), nullable=False),
        sa.Column("expected_completion_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("required_components", sa.JSON(), nullable=False),
        sa.Column("components_reserved", sa.Boolean(), nullable=False),
        sa.Column("output_counted_in_inventory", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("planned_quantity > 0", name=op.f("ck_production_batches_planned_quantity_positive")),
        sa.CheckConstraint("completed_quantity >= 0", name=op.f("ck_production_batches_completed_quantity_non_negative")),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], name=op.f("fk_production_batches_plant_id_plants"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], name=op.f("fk_production_batches_sku_id_skus"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_production_batches")),
        sa.UniqueConstraint("batch_code", name=op.f("uq_production_batches_batch_code")),
    )
    op.create_index(op.f("ix_production_batches_batch_code"), "production_batches", ["batch_code"], unique=True)

    op.create_table(
        "customer_offers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("proposed_delivery_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("offered_quantity", sa.Integer(), nullable=False),
        sa.Column("offer_details", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("customer_reply_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("offered_quantity > 0", name=op.f("ck_customer_offers_offered_quantity_positive")),
        sa.ForeignKeyConstraint(["order_id"], ["customer_orders.id"], name=op.f("fk_customer_offers_order_id_customer_orders"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_offers")),
    )
    op.create_index(op.f("ix_customer_offers_order_id"), "customer_offers", ["order_id"], unique=False)

    op.create_table(
        "order_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("proposed_delivery_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("planned_quantity", sa.Integer(), nullable=False),
        sa.Column("available_on_date", sa.Integer(), nullable=False),
        sa.Column("is_feasible", sa.Boolean(), nullable=False),
        sa.Column("stock_version", sa.Integer(), nullable=False),
        sa.Column("order_version", sa.Integer(), nullable=False),
        sa.Column("plan_details", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("planned_quantity > 0", name=op.f("ck_order_plans_plan_quantity_positive")),
        sa.ForeignKeyConstraint(["order_id"], ["customer_orders.id"], name=op.f("fk_order_plans_order_id_customer_orders"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_plans")),
    )
    op.create_index(op.f("ix_order_plans_order_id"), "order_plans", ["order_id"], unique=False)


def downgrade() -> None:
    """Revert migration changes."""
    op.drop_index(op.f("ix_order_plans_order_id"), table_name="order_plans")
    op.drop_table("order_plans")
    op.drop_index(op.f("ix_customer_offers_order_id"), table_name="customer_offers")
    op.drop_table("customer_offers")
    op.drop_index(op.f("ix_production_batches_batch_code"), table_name="production_batches")
    op.drop_table("production_batches")
    op.drop_index(op.f("ix_order_allocations_order_id"), table_name="order_allocations")
    op.drop_table("order_allocations")
    op.drop_index(op.f("ix_order_status_history_order_id"), table_name="order_status_history")
    op.drop_table("order_status_history")
    op.drop_index("ix_customer_orders_priority", table_name="customer_orders")
    op.drop_index(op.f("ix_customer_orders_order_number"), table_name="customer_orders")
    op.drop_table("customer_orders")
