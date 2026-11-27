"""Tests for idempotent duplicate inventory event handling."""

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import InventoryEvent


def test_duplicate_event_same_source_is_idempotent(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Submitting the same (source, external_event_id) twice returns 200 and stores one event."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    motors = seeded_catalog["skus"]["Motors"]  # type: ignore[index]

    payload = {
        "source": "erp-udupi",
        "external_event_id": "dup-motor-001",
        "plant_id": udupi.id,
        "sku_id": motors.id,
        "event_type": "STOCK_RECEIVED",
        "quantity": 20,
        "source_sequence": 1,
        "occurred_at": "2026-11-27T09:00:00Z",
        "metadata": {"po": "PO-101"},
    }

    first = client.post("/events", json=payload)
    assert first.status_code == 201
    first_body = first.json()
    assert first_body["status"] == "accepted"
    assert first_body["idempotent"] is False

    second = client.post("/events", json=payload)
    assert second.status_code == 200
    second_body = second.json()
    assert second_body["status"] == "duplicate"
    assert second_body["idempotent"] is True
    assert second_body["event"]["id"] == first_body["event"]["id"]

    total = db_session.execute(
        select(func.count()).select_from(InventoryEvent).where(
            InventoryEvent.source == "erp-udupi",
            InventoryEvent.external_event_id == "dup-motor-001",
        )
    ).scalar_one()
    assert total == 1


def test_same_external_event_id_from_different_sources_are_distinct(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Two different sources using the same external_event_id are treated as distinct events."""
    mangaluru = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    copper = seeded_catalog["skus"]["Copper wire"]  # type: ignore[index]

    base = {
        "external_event_id": "shared-id-1",
        "plant_id": mangaluru.id,
        "sku_id": copper.id,
        "event_type": "STOCK_RECEIVED",
        "quantity": 100,
        "source_sequence": 1,
        "occurred_at": "2026-11-27T09:30:00Z",
    }

    r1 = client.post("/events", json={**base, "source": "source-a"})
    r2 = client.post("/events", json={**base, "source": "source-b"})

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["event"]["id"] != r2.json()["event"]["id"]

    total = db_session.execute(select(func.count()).select_from(InventoryEvent)).scalar_one()
    assert total == 2
