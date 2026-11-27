"""Tests for order reservation integration, release, and replay consistency."""

from fastapi.testclient import TestClient


def test_release_order_allocation_restores_available_stock_and_survives_replay(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify order allocations emit STOCK_RESERVED/STOCK_RELEASED events consistent with replay."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    motors = seeded_catalog["skus"]["Motors"]  # type: ignore[index]

    assert client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "res-seed-20",
            "plant_id": udupi.id,
            "sku_id": motors.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 20,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    order = client.post(
        "/orders",
        json={
            "order_number": "ORD-RES-1",
            "customer_name": "Coastal Motors",
            "plant_id": udupi.id,
            "sku_id": motors.id,
            "quantity": 15,
            "requested_delivery_date": "2026-12-01T10:00:00Z",
        },
    ).json()

    assert client.post(f"/orders/allocate?order_id={order['id']}").status_code == 200
    assert client.get(f"/stock/{udupi.id}/{motors.id}").json()["available_stock"] == 5

    # Replay must preserve the reservation
    assert client.post(f"/inventory/replay?plant_id={udupi.id}&sku_id={motors.id}").status_code == 200
    assert client.get(f"/stock/{udupi.id}/{motors.id}").json()["available_stock"] == 5

    # Release allocation
    rel = client.post(f"/orders/{order['id']}/release")
    assert rel.status_code == 200
    assert rel.json()["allocated_quantity"] == 0
    assert rel.json()["status"] == "BACKLOGGED"

    assert client.get(f"/stock/{udupi.id}/{motors.id}").json()["available_stock"] == 20
    allocs = client.get(f"/orders/{order['id']}/allocations").json()
    assert allocs[0]["status"] == "RELEASED"
