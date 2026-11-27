"""End-to-end verification of the SETUVYUHA Part 11 demonstration scenario."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.inventory.demo import seed_demo_catalog


def test_full_demo_scenario_end_to_end(client: TestClient, db_session: Session) -> None:
    """Verify all 8 steps of the SETUVYUHA demonstration scenario."""
    catalog = seed_demo_catalog(db_session)
    udupi_id = catalog["plants"]["Udupi"]
    fans_id = catalog["skus"]["Electric fans"]
    motors_id = catalog["skus"]["Motors"]

    # 1. Udupi initially has 50 electric fans
    r1 = client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "demo-udupi-fans-50",
            "plant_id": udupi_id,
            "sku_id": fans_id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 50,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    )
    assert r1.status_code == 201

    # 2 & 3. Physical correction changes count to 40 and recalculates available stock
    correction_payload = {
        "source": "cycle-count-udupi",
        "external_event_id": "demo-udupi-count-40",
        "plant_id": udupi_id,
        "sku_id": fans_id,
        "event_type": "PHYSICAL_COUNT",
        "quantity": 40,
        "source_sequence": 1,
        "occurred_at": "2026-11-27T09:00:00Z",
    }
    assert client.post("/events", json=correction_payload).status_code == 201

    # 4. Submitting the same correction twice does not apply it twice
    dup = client.post("/events", json=correction_payload)
    assert dup.status_code == 200
    assert dup.json()["idempotent"] is True

    fans_stock = client.get(f"/stock/{udupi_id}/{fans_id}").json()
    assert fans_stock["physical_stock"] == 40
    assert fans_stock["available_stock"] == 40

    # 5. A motor receipt increases stock exactly once
    motor_payload = {
        "source": "wms-udupi",
        "external_event_id": "demo-udupi-motors-25",
        "plant_id": udupi_id,
        "sku_id": motors_id,
        "event_type": "STOCK_RECEIVED",
        "quantity": 25,
        "source_sequence": 2,
        "occurred_at": "2026-11-27T08:30:00Z",
    }
    assert client.post("/events", json=motor_payload).status_code == 201
    assert client.post("/events", json=motor_payload).status_code == 200
    assert client.get(f"/stock/{udupi_id}/{motors_id}").json()["physical_stock"] == 25

    # 6. An invalid event is quarantined
    bad = client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "demo-bad-dispatch",
            "plant_id": udupi_id,
            "sku_id": motors_id,
            "event_type": "STOCK_DISPATCHED",
            "quantity": 500,
            "source_sequence": 3,
            "occurred_at": "2026-11-27T09:45:00Z",
        },
    )
    assert bad.status_code == 422
    assert client.get("/events/quarantined").json()["total"] == 1

    # 7. A feed becomes stale after its configured timeout
    hb_time = datetime.now(timezone.utc)
    assert client.post(
        "/feeds/heartbeat",
        json={
            "source": "wms-udupi",
            "stale_threshold_seconds": 30,
            "observed_at": hb_time.isoformat(),
        },
    ).status_code == 200
    stale_check = client.get(
        "/feeds/status",
        params={"source": "wms-udupi", "as_of": (hb_time + timedelta(seconds=60)).isoformat()},
    ).json()
    assert stale_check["feeds"][0]["is_stale"] is True
    assert stale_check["feeds"][0]["status"] == "STALE"

    # 8. Replaying events reconstructs the exact same stock balance
    replay = client.post("/inventory/replay").json()
    assert replay["events_replayed"] == 3
    assert client.get(f"/stock/{udupi_id}/{fans_id}").json()["physical_stock"] == 40
    assert client.get(f"/stock/{udupi_id}/{motors_id}").json()["physical_stock"] == 25
