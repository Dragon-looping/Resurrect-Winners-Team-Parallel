"""Tests for priority-based inventory allocation engine."""

from fastapi.testclient import TestClient


def test_allocation_prioritizes_earliest_deadline_then_created_then_id(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify allocation serves earliest agreed_delivery_date first and prevents double allocation."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    # Seed 30 electric fans
    assert client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "alloc-seed-30",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 30,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    # Later deadline created first
    late = client.post(
        "/orders",
        json={
            "order_number": "ORD-LATE",
            "customer_name": "Late Customer",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 20,
            "requested_delivery_date": "2026-12-10T10:00:00Z",
        },
    ).json()

    # Earlier deadline created second
    early = client.post(
        "/orders",
        json={
            "order_number": "ORD-EARLY",
            "customer_name": "Early Customer",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 20,
            "requested_delivery_date": "2026-12-02T10:00:00Z",
        },
    ).json()

    resp = client.post(f"/orders/allocate?plant_id={udupi.id}&sku_id={fans.id}")
    assert resp.status_code == 200

    early_after = client.get(f"/orders/{early['id']}").json()
    late_after = client.get(f"/orders/{late['id']}").json()

    assert early_after["allocated_quantity"] == 20
    assert early_after["status"] == "ALLOCATED"

    assert late_after["allocated_quantity"] == 10
    assert late_after["status"] == "PARTIALLY_ALLOCATED"

    stock = client.get(f"/stock/{udupi.id}/{fans.id}").json()
    assert stock["physical_stock"] == 30
    assert stock["reserved_stock"] == 30
    assert stock["available_stock"] == 0
