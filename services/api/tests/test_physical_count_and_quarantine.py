"""Tests for physical stock corrections and invalid event quarantine."""

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import InventoryBalance, InventoryEvent, QuarantinedEvent


def test_physical_count_correction_udupi_50_to_40_is_idempotent(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify Udupi 50 -> 40 physical count correction updates projections once and preserves history."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    # Initial receipt: 50 electric fans
    r1 = client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "udupi-init-50",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 50,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    )
    assert r1.status_code == 201

    # Reserve 10 fans so available stock is 40 before correction
    r2 = client.post(
        "/events",
        json={
            "source": "oms",
            "external_event_id": "udupi-reserve-10",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RESERVED",
            "quantity": 10,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T09:00:00Z",
        },
    )
    assert r2.status_code == 201

    # Physical count discovers only 40 fans (absolute quantity, NOT +40)
    count_payload = {
        "source": "cycle-count-udupi",
        "external_event_id": "udupi-count-40",
        "plant_id": udupi.id,
        "sku_id": fans.id,
        "event_type": "PHYSICAL_COUNT",
        "quantity": 40,
        "source_sequence": 1,
        "occurred_at": "2026-11-27T10:00:00Z",
        "metadata": {"counted_by": "warehouse-staff"},
    }
    r3 = client.post("/events", json=count_payload)
    assert r3.status_code == 201

    # Submitting the exact same correction twice must not apply it twice
    r4 = client.post("/events", json=count_payload)
    assert r4.status_code == 200
    assert r4.json()["idempotent"] is True

    balance = db_session.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == udupi.id,
            InventoryBalance.sku_id == fans.id,
        )
    ).scalar_one()
    assert balance.physical_stock == 40
    assert balance.reserved_stock == 10
    assert balance.available_stock == 30

    event_count = db_session.execute(
        select(func.count()).select_from(InventoryEvent).where(
            InventoryEvent.plant_id == udupi.id,
            InventoryEvent.sku_id == fans.id,
        )
    ).scalar_one()
    assert event_count == 3


def test_malformed_and_invalid_events_are_quarantined_without_affecting_stock(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify malformed JSON, schema failures, and domain failures go to quarantine."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    motors = seeded_catalog["skus"]["Motors"]  # type: ignore[index]

    # Seed valid stock of 15 motors
    assert client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "valid-motors-15",
            "plant_id": udupi.id,
            "sku_id": motors.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 15,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    # 1. Malformed JSON
    malformed = client.post(
        "/events",
        content=b"{bad-json",
        headers={"Content-Type": "application/json"},
    )
    assert malformed.status_code == 422
    assert "quarantined_event_id" in malformed.json()["detail"]

    # 2. Schema error (invalid event_type & negative quantity)
    schema_bad = client.post(
        "/events",
        json={
            "source": "bad-feed",
            "external_event_id": "bad-schema-1",
            "plant_id": udupi.id,
            "sku_id": motors.id,
            "event_type": "UNKNOWN_TYPE",
            "quantity": -5,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T09:00:00Z",
        },
    )
    assert schema_bad.status_code == 422
    assert "quarantined_event_id" in schema_bad.json()["detail"]

    # 3. Domain error (dispatching more than available)
    domain_bad = client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "bad-dispatch-99",
            "plant_id": udupi.id,
            "sku_id": motors.id,
            "event_type": "STOCK_DISPATCHED",
            "quantity": 99,
            "source_sequence": 2,
            "occurred_at": "2026-11-27T09:30:00Z",
        },
    )
    assert domain_bad.status_code == 422
    assert "quarantined_event_id" in domain_bad.json()["detail"]

    # Verify inventory balance remained 15
    balance = db_session.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == udupi.id,
            InventoryBalance.sku_id == motors.id,
        )
    ).scalar_one()
    assert balance.physical_stock == 15
    assert balance.available_stock == 15

    # Verify GET /events/quarantined exposes all 3 records
    q_resp = client.get("/events/quarantined")
    assert q_resp.status_code == 200
    q_body = q_resp.json()
    assert q_body["total"] == 3
    assert len(q_body["items"]) == 3

    filtered = client.get("/events/quarantined?source=bad-feed")
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["external_event_id"] == "bad-schema-1"

    total_q = db_session.execute(select(func.count()).select_from(QuarantinedEvent)).scalar_one()
    assert total_q == 3
