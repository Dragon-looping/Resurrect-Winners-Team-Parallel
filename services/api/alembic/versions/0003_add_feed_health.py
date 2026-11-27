"""Add feed_health table for monitoring event source heartbeats and staleness.

Revision ID: 0003_add_feed_health
Revises: 0002_add_quarantined_events
Create Date: 2026-11-27 14:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0003_add_feed_health"
down_revision: Union[str, Sequence[str], None] = "0002_add_quarantined_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply migration changes."""
    op.create_table(
        "feed_health",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_message", sa.Text(), nullable=True),
        sa.Column("recent_failure_count", sa.Integer(), nullable=False),
        sa.Column("total_events_ingested", sa.Integer(), nullable=False),
        sa.Column("stale_threshold_seconds", sa.Integer(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_feed_health")),
        sa.UniqueConstraint("source", name=op.f("uq_feed_health_source")),
    )
    op.create_index(op.f("ix_feed_health_source"), "feed_health", ["source"], unique=True)


def downgrade() -> None:
    """Revert migration changes."""
    op.drop_index(op.f("ix_feed_health_source"), table_name="feed_health")
    op.drop_table("feed_health")
