"""Tests for production batch readiness, component reservations, and idempotent completion."""

from fastapi.testclient import TestClient


def test_production_batch_reserves_components_and_completes_once(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify production batch reserves components and never double-counts output."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]
    copper = seeded_catalog["skus"]["Copper wire"]  # type: ignore[index]

    # Seed 100m copper wire
    assert client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "prod-copper-100",
            "plant_id": udupi.id,
            "sku_id": copper.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 100,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    batch = client.post(
        "/production/batches",
        json={
            "batch_code": "BATCH-UDUPI-01",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "planned_quantity": 20,
            "expected_completion_at": "2026-12-01T12:00:00Z",
            "required_components": [{"sku_id": copper.id, "quantity": 40}],
            "reserve_components": True,
        },
    )
    assert batch.status_code == 201
    assert batch.json()["components_reserved"] is True
    assert client.get(f"/stock/{udupi.id}/{copper.id}").json()["available_stock"] == 60

    bid = batch.json()["id"]
    c1 = client.post(f"/production/batches/{bid}/complete")
    assert c1.status_code == 200
    assert c1.json()["output_counted_in_inventory"] is True

    # Completing twice must not double-count output
    c2 = client.post(f"/production/batches/{bid}/complete")
    assert c2.status_code == 200
    assert client.get(f"/stock/{udupi.id}/{fans.id}").json()["physical_stock"] == 20
