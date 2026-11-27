"""Tests for order backlog and delivery risk analysis."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient


def test_backlog_and_risk_distinguishes_shortage_from_stale_feed(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify GET /orders/backlog and GET /orders/risk report shortages and stale feeds."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    order = client.post(
        "/orders",
        json={
            "order_number": "ORD-RISK-1",
            "customer_name": "Risk Customer",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 50,
            "requested_delivery_date": "2026-12-05T10:00:00Z",
        },
    ).json()

    # No feed yet -> CONFIRMED_SHORTAGE (0 available, 50 short)
    risk = client.get(f"/orders/risk?plant_id={udupi.id}").json()
    assert len(risk) == 1
    assert risk[0]["order_id"] == order["id"]
    assert risk[0]["shortage_quantity"] == 50
    assert risk[0]["at_risk"] is True
    assert risk[0]["risk_classification"] == "CONFIRMED_SHORTAGE"

    # Register a stale feed (heartbeat 2 hours ago, threshold 30s)
    old_hb = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    assert client.post(
        "/feeds/heartbeat",
        json={"source": "wms-udupi", "stale_threshold_seconds": 30, "observed_at": old_hb},
    ).status_code == 200

    stale_risk = client.get(f"/orders/backlog?plant_id={udupi.id}").json()
    assert stale_risk[0]["feed_is_stale"] is True
    assert stale_risk[0]["risk_classification"] == "STALE_FEED_RISK"
