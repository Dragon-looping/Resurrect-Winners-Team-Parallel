"""Tests for inventory feed health monitoring, heartbeats, and staleness detection."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.inventory.feeds import evaluate_feed_status
from app.models import FeedHealth, FeedStatus


def test_heartbeat_marks_feed_healthy_and_detects_staleness(client: TestClient) -> None:
    """Verify POST /feeds/heartbeat and GET /feeds/status report healthy vs stale feeds."""
    t0 = datetime(2026, 11, 27, 10, 0, 0, tzinfo=timezone.utc)

    hb = client.post(
        "/feeds/heartbeat",
        json={
            "source": "wms-udupi",
            "stale_threshold_seconds": 30,
            "observed_at": t0.isoformat(),
        },
    )
    assert hb.status_code == 200
    assert hb.json()["status"] == "HEALTHY"
    assert hb.json()["is_stale"] is False

    # Within threshold (t0 + 20s) -> HEALTHY
    t_healthy = (t0 + timedelta(seconds=20)).isoformat()
    status_ok = client.get("/feeds/status", params={"source": "wms-udupi", "as_of": t_healthy})
    assert status_ok.status_code == 200
    feed_ok = status_ok.json()["feeds"][0]
    assert feed_ok["status"] == "HEALTHY"
    assert feed_ok["is_stale"] is False
    assert feed_ok["data_warning"] is None

    # Past threshold (t0 + 45s) -> STALE with clear warning distinguishing stale data from shortages
    t_stale = (t0 + timedelta(seconds=45)).isoformat()
    status_stale = client.get("/feeds/status", params={"source": "wms-udupi", "as_of": t_stale})
    assert status_stale.status_code == 200
    feed_stale = status_stale.json()["feeds"][0]
    assert feed_stale["status"] == "STALE"
    assert feed_stale["is_stale"] is True
    assert "stale" in feed_stale["data_warning"].lower()
    assert "shortage" in feed_stale["data_warning"].lower()


def test_unknown_source_without_signals_is_reported_unknown(db_session: Session) -> None:
    """Verify a feed with no heartbeat or event timestamps is reported UNKNOWN and stale."""
    feed = FeedHealth(source="erp-manipal")
    db_session.add(feed)
    db_session.commit()

    evaluated = evaluate_feed_status(feed, default_threshold_seconds=60)
    assert evaluated.status == FeedStatus.UNKNOWN
    assert evaluated.is_stale is True
    assert evaluated.seconds_since_last_signal is None


def test_feed_tracks_ingestion_success_and_failures(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify successful and quarantined events update feed health metrics."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    assert client.post(
        "/events",
        json={
            "source": "wms-mangaluru",
            "external_event_id": "fh-1",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 10,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T10:00:00Z",
        },
    ).status_code == 201

    assert client.post(
        "/events",
        json={
            "source": "wms-mangaluru",
            "external_event_id": "fh-bad",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_DISPATCHED",
            "quantity": 999,
            "source_sequence": 2,
            "occurred_at": "2026-11-27T10:01:00Z",
        },
    ).status_code == 422

    resp = client.get("/feeds/status", params={"source": "wms-mangaluru"})
    assert resp.status_code == 200
    feed = resp.json()["feeds"][0]
    assert feed["total_events_ingested"] == 1
    assert feed["recent_failure_count"] == 1
    assert feed["last_error_message"] is not None
