"""Add quarantined_events table for invalid and malformed events.

Revision ID: 0002_add_quarantined_events
Revises: 0001_initial_inventory_tables
Create Date: 2026-11-27 14:12:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_add_quarantined_events"
down_revision: Union[str, Sequence[str], None] = "0001_initial_inventory_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply migration changes."""
    op.create_table(
        "quarantined_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source", sa.String(length=100), nullable=True),
        sa.Column("external_event_id", sa.String(length=150), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=False),
        sa.Column("error_details", sa.JSON(), nullable=True),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quarantined_events")),
    )
    op.create_index(
        "ix_quarantined_events_received_at",
        "quarantined_events",
        ["received_at"],
        unique=False,
    )
    op.create_index(
        "ix_quarantined_events_source",
        "quarantined_events",
        ["source"],
        unique=False,
    )


def downgrade() -> None:
    """Revert migration changes."""
    op.drop_index("ix_quarantined_events_source", table_name="quarantined_events")
    op.drop_index("ix_quarantined_events_received_at", table_name="quarantined_events")
    op.drop_table("quarantined_events")
