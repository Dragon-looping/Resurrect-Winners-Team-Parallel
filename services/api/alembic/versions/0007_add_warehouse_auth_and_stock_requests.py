"""Add warehouse users, inter-warehouse stock requests, and audit logs.

Revision ID: 0007_warehouse_auth_requests
Revises: 0006_add_procurement_tables
Create Date: 2026-11-27 22:50:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0007_warehouse_auth_requests"
down_revision: str | Sequence[str] | None = "0006_add_procurement_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create warehouse_users, inter_warehouse_requests, and warehouse_audit_logs."""
    op.create_table(
        "warehouse_users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("login_id", sa.String(length=80), nullable=False),
        sa.Column("password_hash", sa.String(length=256), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("WAREHOUSE_USER", name="warehouse_user_role"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_warehouse_users_login_id", "warehouse_users", ["login_id"], unique=True)
    op.create_index("ix_warehouse_users_plant_id", "warehouse_users", ["plant_id"], unique=False)

    op.create_table(
        "inter_warehouse_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("request_code", sa.String(length=64), nullable=False),
        sa.Column("idempotency_key", sa.String(length=120), nullable=True),
        sa.Column("requesting_plant_id", sa.Integer(), nullable=False),
        sa.Column("supplying_plant_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("requested_qty", sa.Integer(), nullable=False),
        sa.Column("approved_qty", sa.Integer(), nullable=True),
        sa.Column("dispatched_qty", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("received_qty", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING",
                "APPROVED",
                "PARTIALLY_APPROVED",
                "REJECTED",
                "DISPATCHED",
                "PARTIALLY_FULFILLED",
                "FULFILLED",
                "CANCELLED",
                name="inter_warehouse_request_status",
            ),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("dispatch_event_id", sa.Integer(), nullable=True),
        sa.Column("receipt_event_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "requesting_plant_id <> supplying_plant_id",
            name="ck_iwr_different_plants",
        ),
        sa.CheckConstraint("requested_qty > 0", name="ck_iwr_requested_qty_positive"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["warehouse_users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["dispatch_event_id"], ["inventory_events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["receipt_event_id"], ["inventory_events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requesting_plant_id"], ["plants.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["warehouse_users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supplying_plant_id"], ["plants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_inter_warehouse_requests_request_code",
        "inter_warehouse_requests",
        ["request_code"],
        unique=True,
    )
    op.create_index(
        "ix_inter_warehouse_requests_idempotency_key",
        "inter_warehouse_requests",
        ["idempotency_key"],
        unique=True,
    )
    op.create_index(
        "ix_iwr_requesting_status",
        "inter_warehouse_requests",
        ["requesting_plant_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_iwr_supplying_status",
        "inter_warehouse_requests",
        ["supplying_plant_id", "status"],
        unique=False,
    )

    op.create_table(
        "warehouse_audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_login_id", sa.String(length=80), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=False),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["warehouse_users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plant_id"], ["plants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_warehouse_audit_logs_actor_user_id",
        "warehouse_audit_logs",
        ["actor_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_warehouse_audit_logs_plant_id",
        "warehouse_audit_logs",
        ["plant_id"],
        unique=False,
    )
    op.create_index(
        "ix_warehouse_audit_logs_action",
        "warehouse_audit_logs",
        ["action"],
        unique=False,
    )


def downgrade() -> None:
    """Drop warehouse_audit_logs, inter_warehouse_requests, and warehouse_users."""
    op.drop_index("ix_warehouse_audit_logs_action", table_name="warehouse_audit_logs")
    op.drop_index("ix_warehouse_audit_logs_plant_id", table_name="warehouse_audit_logs")
    op.drop_index("ix_warehouse_audit_logs_actor_user_id", table_name="warehouse_audit_logs")
    op.drop_table("warehouse_audit_logs")

    op.drop_index("ix_iwr_supplying_status", table_name="inter_warehouse_requests")
    op.drop_index("ix_iwr_requesting_status", table_name="inter_warehouse_requests")
    op.drop_index(
        "ix_inter_warehouse_requests_idempotency_key",
        table_name="inter_warehouse_requests",
    )
    op.drop_index(
        "ix_inter_warehouse_requests_request_code",
        table_name="inter_warehouse_requests",
    )
    op.drop_table("inter_warehouse_requests")

    op.drop_index("ix_warehouse_users_plant_id", table_name="warehouse_users")
    op.drop_index("ix_warehouse_users_login_id", table_name="warehouse_users")
    op.drop_table("warehouse_users")

    sa.Enum(name="inter_warehouse_request_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="warehouse_user_role").drop(op.get_bind(), checkfirst=True)
