"""Tests for order lifecycle state transitions and status history."""

from fastapi.testclient import TestClient


def test_order_lifecycle_valid_and_invalid_transitions(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify valid transitions succeed, invalid transitions return 409, and history is recorded."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    created = client.post(
        "/orders",
        json={
            "order_number": "ORD-LC-1",
            "customer_name": "Malabar Stores",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 10,
            "requested_delivery_date": "2026-12-05T10:00:00Z",
        },
    ).json()
    oid = created["id"]

    # Invalid direct jump: CREATED -> DISPATCHED
    bad = client.post(f"/orders/{oid}/status", json={"to_status": "DISPATCHED", "reason": "skip"})
    assert bad.status_code == 409

    # Valid path: CREATED -> CONFIRMED -> READY_FOR_DISPATCH -> DISPATCHED
    assert client.post(f"/orders/{oid}/status", json={"to_status": "CONFIRMED", "reason": "ok"}).status_code == 200
    assert client.post(f"/orders/{oid}/status", json={"to_status": "READY_FOR_DISPATCH"}).status_code == 200
    assert client.post(f"/orders/{oid}/status", json={"to_status": "DISPATCHED"}).status_code == 200

    # Terminal state: DISPATCHED -> CANCELLED must fail
    terminal_bad = client.post(f"/orders/{oid}/status", json={"to_status": "CANCELLED"})
    assert terminal_bad.status_code == 409

    history = client.get(f"/orders/{oid}/history").json()
    assert [h["to_status"] for h in history] == [
        "CREATED",
        "CONFIRMED",
        "READY_FOR_DISPATCH",
        "DISPATCHED",
    ]
