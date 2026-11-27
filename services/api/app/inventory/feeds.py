"""Feed health tracking, heartbeat recording, and staleness evaluation."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.inventory.engine import normalize_utc
from app.models import FeedHealth, FeedStatus
from app.schemas.feed import FeedStatusItem


def _get_or_create_feed(db: Session, source: str) -> FeedHealth:
    feed = db.execute(select(FeedHealth).where(FeedHealth.source == source)).scalar_one_or_none()
    if feed is None:
        feed = FeedHealth(
            source=source,
            recent_failure_count=0,
            total_events_ingested=0,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(feed)
        db.flush()
    return feed


def record_heartbeat(
    db: Session,
    *,
    source: str,
    stale_threshold_seconds: int | None = None,
    observed_at: datetime | None = None,
) -> FeedHealth:
    """Record a heartbeat for an event source."""
    now_utc = normalize_utc(observed_at) if observed_at else datetime.now(timezone.utc)
    feed = _get_or_create_feed(db, source)
    feed.last_heartbeat_at = now_utc
    if stale_threshold_seconds is not None:
        feed.stale_threshold_seconds = stale_threshold_seconds
    feed.updated_at = now_utc
    db.commit()
    db.refresh(feed)
    return feed


def record_feed_event_success(
    db: Session,
    *,
    source: str,
    received_at: datetime | None = None,
) -> FeedHealth:
    """Update feed health after a successful event ingestion."""
    now_utc = normalize_utc(received_at) if received_at else datetime.now(timezone.utc)
    feed = _get_or_create_feed(db, source)
    feed.last_event_at = now_utc
    feed.total_events_ingested += 1
    feed.recent_failure_count = 0
    feed.updated_at = now_utc
    db.commit()
    db.refresh(feed)
    return feed


def record_feed_event_failure(
    db: Session,
    *,
    source: str,
    error_message: str,
    received_at: datetime | None = None,
) -> FeedHealth:
    """Record an ingestion failure for an event source."""
    now_utc = normalize_utc(received_at) if received_at else datetime.now(timezone.utc)
    feed = _get_or_create_feed(db, source)
    feed.last_error_at = now_utc
    feed.last_error_message = error_message
    feed.recent_failure_count += 1
    feed.updated_at = now_utc
    db.commit()
    db.refresh(feed)
    return feed


def evaluate_feed_status(
    feed: FeedHealth,
    *,
    now: datetime | None = None,
    default_threshold_seconds: int | None = None,
) -> FeedStatusItem:
    """Compute health, staleness, and data-warning metadata for a feed."""
    checked_at = normalize_utc(now) if now else datetime.now(timezone.utc)
    threshold = (
        feed.stale_threshold_seconds
        if feed.stale_threshold_seconds is not None
        else (default_threshold_seconds or get_settings().feed_stale_threshold_seconds)
    )

    signals = [
        normalize_utc(ts)
        for ts in (feed.last_heartbeat_at, feed.last_event_at)
        if ts is not None
    ]
    last_signal = max(signals) if signals else None

    if last_signal is None:
        return FeedStatusItem(
            source=feed.source,
            status=FeedStatus.UNKNOWN,
            is_stale=True,
            stale_threshold_seconds=threshold,
            seconds_since_last_signal=None,
            last_heartbeat_at=feed.last_heartbeat_at,
            last_event_at=feed.last_event_at,
            last_error_at=feed.last_error_at,
            last_error_message=feed.last_error_message,
            recent_failure_count=feed.recent_failure_count,
            total_events_ingested=feed.total_events_ingested,
            data_warning="No heartbeat or events received yet; stock data may be incomplete.",
        )

    elapsed = max(0.0, (checked_at - last_signal).total_seconds())
    is_stale = elapsed > threshold

    if is_stale:
        status = FeedStatus.STALE
        warning = (
            "Feed is stale; low or unchanged stock may reflect missing updates "
            "rather than an actual stock shortage."
        )
    elif (
        feed.recent_failure_count > 0
        and feed.last_error_at is not None
        and normalize_utc(feed.last_error_at) >= last_signal
    ):
        status = FeedStatus.DEGRADED
        warning = "Recent ingestion failures detected; verify quarantined events."
    else:
        status = FeedStatus.HEALTHY
        warning = None

    return FeedStatusItem(
        source=feed.source,
        status=status,
        is_stale=is_stale,
        stale_threshold_seconds=threshold,
        seconds_since_last_signal=round(elapsed, 3),
        last_heartbeat_at=feed.last_heartbeat_at,
        last_event_at=feed.last_event_at,
        last_error_at=feed.last_error_at,
        last_error_message=feed.last_error_message,
        recent_failure_count=feed.recent_failure_count,
        total_events_ingested=feed.total_events_ingested,
        data_warning=warning,
    )


def list_feed_statuses(
    db: Session,
    *,
    source: str | None = None,
    as_of: datetime | None = None,
) -> tuple[datetime, list[FeedStatusItem]]:
    """Return evaluated health status for all tracked feeds (or a specific source)."""
    checked_at = normalize_utc(as_of) if as_of else datetime.now(timezone.utc)
    stmt = select(FeedHealth).order_by(FeedHealth.source.asc())
    if source:
        stmt = stmt.where(FeedHealth.source == source)

    feeds = db.execute(stmt).scalars().all()
    items = [evaluate_feed_status(feed, now=checked_at) for feed in feeds]
    return checked_at, items
