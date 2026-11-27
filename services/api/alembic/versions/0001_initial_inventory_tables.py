"""Create initial inventory tables: plants, skus, inventory_events, inventory_balances.

Revision ID: 0001_initial_inventory_tables
Revises:
Create Date: 2026-11-27 14:02:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0001_initial_inventory_tables"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply migration changes."""
    op.create_table(
        "plants",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_plants")),
        sa.UniqueConstraint("name", name=op.f("uq_plants_name")),
    )
    op.create_index(op.f("ix_plants_name"), "plants", ["name"], unique=True)

    op.create_table(
        "skus",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sku_code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_skus")),
        sa.UniqueConstraint("sku_code", name=op.f("uq_skus_sku_code")),
    )
    op.create_index(op.f("ix_skus_sku_code"), "skus", ["sku_code"], unique=True)

    op.create_table(
        "inventory_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("external_event_id", sa.String(length=150), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("source_sequence", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.CheckConstraint(
            "source_sequence >= 0",
            name=op.f("ck_inventory_events_source_sequence_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["plant_id"],
            ["plants.id"],
            name=op.f("fk_inventory_events_plant_id_plants"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["sku_id"],
            ["skus.id"],
            name=op.f("fk_inventory_events_sku_id_skus"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_events")),
        sa.UniqueConstraint(
            "source",
            "external_event_id",
            name="uq_inventory_events_source_external_event_id",
        ),
    )
    op.create_index(
        op.f("ix_inventory_events_event_type"),
        "inventory_events",
        ["event_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inventory_events_occurred_at"),
        "inventory_events",
        ["occurred_at"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_events_replay_order",
        "inventory_events",
        ["plant_id", "sku_id", "occurred_at", "source_sequence", "id"],
        unique=False,
    )

    op.create_table(
        "inventory_balances",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("physical_stock", sa.Integer(), nullable=False),
        sa.Column("reserved_stock", sa.Integer(), nullable=False),
        sa.Column("confirmed_arrivals", sa.Integer(), nullable=False),
        sa.Column("available_stock", sa.Integer(), nullable=False),
        sa.Column("last_event_id", sa.Integer(), nullable=True),
        sa.Column("last_occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_source_sequence", sa.Integer(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "physical_stock >= 0",
            name=op.f("ck_inventory_balances_physical_stock_non_negative"),
        ),
        sa.CheckConstraint(
            "reserved_stock >= 0",
            name=op.f("ck_inventory_balances_reserved_stock_non_negative"),
        ),
        sa.CheckConstraint(
            "confirmed_arrivals >= 0",
            name=op.f("ck_inventory_balances_confirmed_arrivals_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["last_event_id"],
            ["inventory_events.id"],
            name=op.f("fk_inventory_balances_last_event_id_inventory_events"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["plant_id"],
            ["plants.id"],
            name=op.f("fk_inventory_balances_plant_id_plants"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["sku_id"],
            ["skus.id"],
            name=op.f("fk_inventory_balances_sku_id_skus"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_balances")),
        sa.UniqueConstraint("plant_id", "sku_id", name="uq_inventory_balances_plant_sku"),
    )
    op.create_index(
        "ix_inventory_balances_plant_sku",
        "inventory_balances",
        ["plant_id", "sku_id"],
        unique=False,
    )


def downgrade() -> None:
    """Revert migration changes."""
    op.drop_index("ix_inventory_balances_plant_sku", table_name="inventory_balances")
    op.drop_table("inventory_balances")
    op.drop_index("ix_inventory_events_replay_order", table_name="inventory_events")
    op.drop_index(op.f("ix_inventory_events_occurred_at"), table_name="inventory_events")
    op.drop_index(op.f("ix_inventory_events_event_type"), table_name="inventory_events")
    op.drop_table("inventory_events")
    op.drop_index(op.f("ix_skus_sku_code"), table_name="skus")
    op.drop_table("skus")
    op.drop_index(op.f("ix_plants_name"), table_name="plants")
    op.drop_table("plants")
