"""Tests for deterministic inventory replay via POST /inventory/replay."""

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import InventoryBalance, InventoryEvent


def test_replay_is_repeatable_and_excludes_quarantined_events(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify repeated replays produce identical balances and exclude quarantined events."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    assert client.post(
        "/events",
        json={
            "source": "wms",
            "external_event_id": "rep-1",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 50,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    assert client.post(
        "/events",
        json={
            "source": "wms",
            "external_event_id": "rep-2",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "PHYSICAL_COUNT",
            "quantity": 40,
            "source_sequence": 2,
            "occurred_at": "2026-11-27T09:00:00Z",
        },
    ).status_code == 201

    # Quarantined event must never be replayed
    assert client.post(
        "/events",
        json={
            "source": "wms",
            "external_event_id": "rep-bad",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_DISPATCHED",
            "quantity": 999,
            "source_sequence": 3,
            "occurred_at": "2026-11-27T10:00:00Z",
        },
    ).status_code == 422

    # Corrupt projection manually to prove replay reconstructs it
    bal = db_session.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == udupi.id,
            InventoryBalance.sku_id == fans.id,
        )
    ).scalar_one()
    bal.physical_stock = 9999
    bal.available_stock = 9999
    db_session.commit()

    r1 = client.post("/inventory/replay")
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["events_replayed"] == 2
    assert b1["balances_updated"] == 1
    assert b1["balances"][0]["physical_stock"] == 40
    assert b1["balances"][0]["available_stock"] == 40

    # Replay a second time: identical result, no duplicate events
    r2 = client.post("/inventory/replay")
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["balances"] == b1["balances"]
    assert b2["events_replayed"] == 2

    total_events = db_session.execute(select(func.count()).select_from(InventoryEvent)).scalar_one()
    assert total_events == 2


def test_replay_supports_plant_and_sku_filters(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify POST /inventory/replay can be scoped to a specific plant_id and sku_id."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    mangaluru = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]
    motors = seeded_catalog["skus"]["Motors"]  # type: ignore[index]

    assert client.post(
        "/events",
        json={
            "source": "wms",
            "external_event_id": "scope-1",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 30,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    assert client.post(
        "/events",
        json={
            "source": "wms",
            "external_event_id": "scope-2",
            "plant_id": mangaluru.id,
            "sku_id": motors.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 15,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    scoped = client.post(f"/inventory/replay?plant_id={udupi.id}&sku_id={fans.id}")
    assert scoped.status_code == 200
    body = scoped.json()
    assert body["events_replayed"] == 1
    assert body["balances_updated"] == 1
    assert body["balances"][0]["plant_id"] == udupi.id
    assert body["balances"][0]["sku_id"] == fans.id
    assert body["balances"][0]["physical_stock"] == 30
