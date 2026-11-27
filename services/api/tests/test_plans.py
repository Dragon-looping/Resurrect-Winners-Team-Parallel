"""Tests for deterministic order plans, feasibility checks, and transactional approval."""

from fastapi.testclient import TestClient


def test_plan_preview_rejects_infeasible_and_detects_stale_stock_version(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify infeasible plans cannot be approved and stale stock versions return 409."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    order = client.post(
        "/orders",
        json={
            "order_number": "ORD-PLN-1",
            "customer_name": "Plan Customer",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 20,
            "requested_delivery_date": "2026-12-05T10:00:00Z",
        },
    ).json()

    # Infeasible plan (0 stock)
    infeasible = client.post(f"/orders/{order['id']}/plans", json={}).json()
    assert infeasible["is_feasible"] is False
    assert client.post(f"/plans/{infeasible['id']}/approve").status_code == 422

    # Seed 25 fans
    assert client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "plan-seed-25",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 25,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    # Feasible plan preview
    feasible = client.post(f"/orders/{order['id']}/plans", json={}).json()
    assert feasible["is_feasible"] is True

    # Mutate stock after preview -> approval must fail with 409 Conflict
    assert client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "plan-mutate-5",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_DISPATCHED",
            "quantity": 5,
            "source_sequence": 2,
            "occurred_at": "2026-11-27T08:30:00Z",
        },
    ).status_code == 201
    assert client.post(f"/plans/{feasible['id']}/approve").status_code == 409

    # Regenerate plan with current stock_version and approve
    fresh = client.post(f"/orders/{order['id']}/plans", json={}).json()
    approved = client.post(f"/plans/{fresh['id']}/approve")
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"

    updated_order = client.get(f"/orders/{order['id']}").json()
    assert updated_order["allocated_quantity"] == 20
    assert updated_order["status"] == "ALLOCATED"
