"""Tests for inventory event ingestion via POST /events."""

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InventoryEvent, InventoryEventType


@pytest.mark.parametrize(
    ("event_type", "quantity"),
    [
        (InventoryEventType.STOCK_RECEIVED.value, 50),
        (InventoryEventType.STOCK_DISPATCHED.value, 10),
        (InventoryEventType.PHYSICAL_COUNT.value, 40),
        (InventoryEventType.STOCK_RESERVED.value, 15),
        (InventoryEventType.STOCK_RELEASED.value, 5),
        (InventoryEventType.STOCK_ADJUSTED.value, -2),
    ],
)
def test_post_events_persists_supported_event_types(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
    event_type: str,
    quantity: int,
) -> None:
    """Verify POST /events validates and persists all supported event types."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    if event_type != InventoryEventType.STOCK_RECEIVED.value:
        seed_receipt = client.post(
            "/events",
            json={
                "source": "wms-udupi",
                "external_event_id": f"seed-receipt-{event_type.lower()}",
                "plant_id": udupi.id,
                "sku_id": fans.id,
                "event_type": InventoryEventType.STOCK_RECEIVED.value,
                "quantity": 100,
                "source_sequence": 0,
                "occurred_at": "2026-11-27T08:00:00Z",
            },
        )
        assert seed_receipt.status_code == 201

    if event_type == InventoryEventType.STOCK_RELEASED.value:
        seed_reserve = client.post(
            "/events",
            json={
                "source": "wms-udupi",
                "external_event_id": "seed-reserve-for-release",
                "plant_id": udupi.id,
                "sku_id": fans.id,
                "event_type": InventoryEventType.STOCK_RESERVED.value,
                "quantity": 20,
                "source_sequence": 0,
                "occurred_at": "2026-11-27T09:00:00Z",
            },
        )
        assert seed_reserve.status_code == 201

    payload = {
        "source": "wms-udupi",
        "external_event_id": f"evt-{event_type.lower()}-1",
        "plant_id": udupi.id,
        "sku_id": fans.id,
        "event_type": event_type,
        "quantity": quantity,
        "source_sequence": 1,
        "occurred_at": "2026-11-27T10:00:00Z",
        "metadata": {"operator": "warehouse-1"},
    }
    response = client.post("/events", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "accepted"
    assert body["idempotent"] is False
    assert body["event"]["event_type"] == event_type
    assert body["event"]["quantity"] == quantity
    assert body["event"]["source_sequence"] == 1
    assert body["event"]["metadata"] == {"operator": "warehouse-1"}

    persisted = db_session.execute(
        select(InventoryEvent).where(InventoryEvent.id == body["event"]["id"])
    ).scalar_one()
    assert persisted.external_event_id == payload["external_event_id"]
    assert persisted.metadata_json == {"operator": "warehouse-1"}


def test_post_events_rejects_missing_plant_or_sku(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify POST /events returns 422 when plant_id or sku_id does not exist."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    bad_plant = client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "evt-bad-plant",
            "plant_id": 9999,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 10,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T10:00:00Z",
        },
    )
    assert bad_plant.status_code == 422
    assert "Plant" in str(bad_plant.json())

    bad_sku = client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "evt-bad-sku",
            "plant_id": udupi.id,
            "sku_id": 9999,
            "event_type": "STOCK_RECEIVED",
            "quantity": 10,
            "source_sequence": 2,
            "occurred_at": "2026-11-27T10:00:00Z",
        },
    )
    assert bad_sku.status_code == 422
    assert "SKU" in str(bad_sku.json())


def test_post_events_validates_quantity_rules(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify POST /events rejects invalid quantities for event types."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    resp = client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "evt-bad-qty",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 0,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T10:00:00Z",
        },
    )
    assert resp.status_code == 422
