"""Routes for inventory feed health monitoring and heartbeats."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.inventory.feeds import evaluate_feed_status, list_feed_statuses, record_heartbeat
from app.schemas.feed import FeedHeartbeatRequest, FeedStatusItem, FeedStatusListResponse

router = APIRouter(tags=["Feed Health"])


@router.post(
    "/feeds/heartbeat",
    response_model=FeedStatusItem,
    summary="Record a feed heartbeat",
    description="Records a heartbeat signal for an event source and returns its current health status.",
)
def post_feed_heartbeat(
    payload: FeedHeartbeatRequest,
    db: Session = Depends(get_db),
) -> FeedStatusItem:
    """Record a heartbeat for an event source."""
    feed = record_heartbeat(
        db,
        source=payload.source,
        stale_threshold_seconds=payload.stale_threshold_seconds,
        observed_at=payload.observed_at,
    )
    return evaluate_feed_status(feed, now=payload.observed_at)


@router.get(
    "/feeds/status",
    response_model=FeedStatusListResponse,
    summary="Get feed health status",
    description="Returns health, staleness, and failure metrics for all tracked event sources.",
)
def get_feeds_status(
    source: str | None = Query(default=None, description="Optional source filter."),
    as_of: datetime | None = Query(default=None, description="Optional evaluation timestamp (UTC)."),
    db: Session = Depends(get_db),
) -> FeedStatusListResponse:
    """Return health and staleness status for tracked event sources."""
    checked_at, feeds = list_feed_statuses(db, source=source, as_of=as_of)
    return FeedStatusListResponse(checked_at=checked_at, feeds=feeds)
