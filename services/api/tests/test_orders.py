"""Tests for customer order creation and retrieval endpoints."""

from fastapi.testclient import TestClient


def test_create_and_retrieve_customer_order_preserves_crd(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify POST /orders creates order, preserves CRD, and GET /orders/{id} returns it."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    resp = client.post(
        "/orders",
        json={
            "order_number": "ORD-1001",
            "customer_name": "Kaveri Traders",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 25,
            "requested_delivery_date": "2026-12-05T10:00:00Z",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["order_number"] == "ORD-1001"
    assert body["status"] == "CREATED"
    assert body["customer_request_date"] == body["agreed_delivery_date"]
    assert body["allocated_quantity"] == 0

    fetched = client.get(f"/orders/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["order_number"] == "ORD-1001"

    listing = client.get(f"/orders?plant_id={udupi.id}&limit=10&offset=0")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    assert client.get("/orders/9999").status_code == 404


def test_duplicate_order_number_returns_409(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify duplicate order_number is rejected cleanly with 409 Conflict."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    payload = {
        "order_number": "ORD-DUP-1",
        "customer_name": "Alpha Corp",
        "plant_id": udupi.id,
        "sku_id": fans.id,
        "quantity": 10,
        "requested_delivery_date": "2026-12-05T10:00:00Z",
    }
    assert client.post("/orders", json=payload).status_code == 201
    assert client.post("/orders", json=payload).status_code == 409
