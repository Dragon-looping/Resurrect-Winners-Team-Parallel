"""Add godown recovery tables: recovery_routes, recovery_plans, recovery_audit_logs.

Revision ID: 0005_add_godown_recovery_tables
Revises: 0004_add_order_lifecycle_tables
Create Date: 2026-11-27 15:21:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005_add_godown_recovery_tables"
down_revision: Union[str, Sequence[str], None] = "0004_add_order_lifecycle_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply migration changes."""
    op.create_table(
        "recovery_routes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("from_plant_id", sa.Integer(), nullable=False),
        sa.Column("to_plant_id", sa.Integer(), nullable=False),
        sa.Column("transit_hours", sa.Integer(), nullable=False),
        sa.Column("truck_cutoff_hour_utc", sa.Integer(), nullable=False),
        sa.Column("freight_cost_per_unit", sa.Float(), nullable=False),
        sa.Column("fixed_dispatch_cost", sa.Float(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("transit_hours >= 0", name=op.f("ck_recovery_routes_transit_hours_non_negative")),
        sa.CheckConstraint("truck_cutoff_hour_utc >= 0 AND truck_cutoff_hour_utc <= 23", name=op.f("ck_recovery_routes_cutoff_hour_valid")),
        sa.ForeignKeyConstraint(["from_plant_id"], ["plants.id"], name=op.f("fk_recovery_routes_from_plant_id_plants"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["to_plant_id"], ["plants.id"], name=op.f("fk_recovery_routes_to_plant_id_plants"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recovery_routes")),
        sa.UniqueConstraint("from_plant_id", "to_plant_id", name="uq_recovery_routes_from_to"),
    )

    op.create_table(
        "recovery_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("target_order_id", sa.Integer(), nullable=False),
        sa.Column("donor_plant_id", sa.Integer(), nullable=False),
        sa.Column("donor_order_id", sa.Integer(), nullable=True),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("recovery_type", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("is_feasible", sa.Boolean(), nullable=False),
        sa.Column("rejection_reasons", sa.JSON(), nullable=False),
        sa.Column("wait_cost", sa.Float(), nullable=False),
        sa.Column("recovery_cost", sa.Float(), nullable=False),
        sa.Column("net_benefit", sa.Float(), nullable=False),
        sa.Column("gross_margin_pct", sa.Float(), nullable=False),
        sa.Column("margin_floor_pct", sa.Float(), nullable=False),
        sa.Column("estimated_delivery_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("target_order_version", sa.Integer(), nullable=False),
        sa.Column("donor_order_version", sa.Integer(), nullable=True),
        sa.Column("target_stock_version", sa.Integer(), nullable=False),
        sa.Column("donor_stock_version", sa.Integer(), nullable=False),
        sa.Column("explanation", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_recovery_plans_recovery_quantity_positive")),
        sa.ForeignKeyConstraint(["donor_order_id"], ["customer_orders.id"], name=op.f("fk_recovery_plans_donor_order_id_customer_orders"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["donor_plant_id"], ["plants.id"], name=op.f("fk_recovery_plans_donor_plant_id_plants"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], name=op.f("fk_recovery_plans_sku_id_skus"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["target_order_id"], ["customer_orders.id"], name=op.f("fk_recovery_plans_target_order_id_customer_orders"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recovery_plans")),
    )
    op.create_index(op.f("ix_recovery_plans_target_order_id"), "recovery_plans", ["target_order_id"], unique=False)

    op.create_table(
        "recovery_audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("recovery_plan_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("actor", sa.String(length=100), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["recovery_plan_id"], ["recovery_plans.id"], name=op.f("fk_recovery_audit_logs_recovery_plan_id_recovery_plans"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recovery_audit_logs")),
    )
    op.create_index(op.f("ix_recovery_audit_logs_recovery_plan_id"), "recovery_audit_logs", ["recovery_plan_id"], unique=False)


def downgrade() -> None:
    """Revert migration changes."""
    op.drop_index(op.f("ix_recovery_audit_logs_recovery_plan_id"), table_name="recovery_audit_logs")
    op.drop_table("recovery_audit_logs")
    op.drop_index(op.f("ix_recovery_plans_target_order_id"), table_name="recovery_plans")
    op.drop_table("recovery_plans")
    op.drop_table("recovery_routes")
