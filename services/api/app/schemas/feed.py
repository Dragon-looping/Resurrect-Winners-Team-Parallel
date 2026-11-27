"""Pydantic schemas for feed health monitoring."""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.enums import FeedStatus


class FeedHeartbeatRequest(BaseModel):
    """Request payload for POST /feeds/heartbeat."""

    source: str = Field(..., min_length=1, max_length=100, description="Event source identifier.")
    stale_threshold_seconds: int | None = Field(
        default=None,
        ge=1,
        le=86400,
        description="Optional per-source staleness threshold in seconds.",
    )
    observed_at: datetime | None = Field(
        default=None,
        description="Optional heartbeat timestamp (defaults to current UTC time).",
    )

    @field_validator("source")
    @classmethod
    def strip_source(cls, value: str) -> str:
        """Ensure source name is trimmed and non-empty."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("source must not be empty")
        return stripped


class FeedStatusItem(BaseModel):
    """Health and staleness status for a single event source."""

    source: str
    status: FeedStatus
    is_stale: bool
    stale_threshold_seconds: int
    seconds_since_last_signal: float | None
    last_heartbeat_at: datetime | None
    last_event_at: datetime | None
    last_error_at: datetime | None
    last_error_message: str | None
    recent_failure_count: int
    total_events_ingested: int
    data_warning: str | None = None


class FeedStatusListResponse(BaseModel):
    """Response payload for GET /feeds/status."""

    checked_at: datetime
    feeds: list[FeedStatusItem]
