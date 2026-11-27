"""Integration tests for stock APIs, event read APIs, and SSE live stream."""

from fastapi.testclient import TestClient

from app.core.events_bus import event_stream_broker


def test_stock_and_event_read_apis_with_filters_and_404s(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify GET /stock*, GET /events, GET /events/{id}, and 404 responses."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    mangaluru = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]
    motors = seeded_catalog["skus"]["Motors"]  # type: ignore[index]

    r1 = client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "read-1",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 50,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    )
    assert r1.status_code == 201
    event_id = r1.json()["event"]["id"]

    assert client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "read-2",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RESERVED",
            "quantity": 10,
            "source_sequence": 2,
            "occurred_at": "2026-11-27T09:00:00Z",
        },
    ).status_code == 201

    assert client.post(
        "/events",
        json={
            "source": "wms-mangaluru",
            "external_event_id": "read-3",
            "plant_id": mangaluru.id,
            "sku_id": motors.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 25,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T10:00:00Z",
        },
    ).status_code == 201

    # GET /stock
    all_stock = client.get("/stock")
    assert all_stock.status_code == 200
    assert all_stock.json()["count"] == 2

    # GET /stock/{plant_id}
    udupi_stock = client.get(f"/stock/{udupi.id}")
    assert udupi_stock.status_code == 200
    assert udupi_stock.json()["count"] == 1
    assert udupi_stock.json()["items"][0]["physical_stock"] == 50
    assert udupi_stock.json()["items"][0]["reserved_stock"] == 10
    assert udupi_stock.json()["items"][0]["available_stock"] == 40

    # GET /stock/{plant_id}/{sku_id}
    pair_stock = client.get(f"/stock/{udupi.id}/{fans.id}")
    assert pair_stock.status_code == 200
    assert pair_stock.json()["available_stock"] == 40

    # 404 checks
    assert client.get("/stock/9999").status_code == 404
    assert client.get(f"/stock/{udupi.id}/9999").status_code == 404
    assert client.get("/events/9999").status_code == 404

    # GET /events with pagination & filters
    ev_list = client.get(f"/events?plant_id={udupi.id}&event_type=STOCK_RESERVED&limit=10&offset=0")
    assert ev_list.status_code == 200
    assert ev_list.json()["total"] == 1
    assert ev_list.json()["items"][0]["event_type"] == "STOCK_RESERVED"

    # GET /events/{event_id}
    single_ev = client.get(f"/events/{event_id}")
    assert single_ev.status_code == 200
    assert single_ev.json()["external_event_id"] == "read-1"


def test_sse_stream_endpoint_and_broker_cleanup(client: TestClient) -> None:
    """Verify GET /stream sends SSE events and cleans up subscriber on disconnect."""
    before = event_stream_broker.subscriber_count
    with client.stream("GET", "/stream?max_events=1") as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        body = "".join(response.iter_text())
        assert "event: connected" in body
    assert event_stream_broker.subscriber_count == before


def test_event_stream_broker_publishes_to_subscribers() -> None:
    """Verify EventStreamBroker delivers formatted SSE messages and unsubscribes cleanly."""
    q = event_stream_broker.subscribe()
    try:
        event_stream_broker.publish("STOCK_RECEIVED", {"plant_id": 1, "quantity": 50})
        msg = q.get_nowait()
        assert "event: STOCK_RECEIVED" in msg
        assert '"quantity": 50' in msg
    finally:
        event_stream_broker.unsubscribe(q)
