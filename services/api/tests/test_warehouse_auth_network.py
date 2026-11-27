"""Mandatory tests for multi-warehouse authentication, isolation, and stock requests."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.seed import seed_warehouse_accounts
from app.models import Plant, SKU


def _login(client: TestClient, login_id: str, password: str) -> tuple[str, dict]:
    res = client.post("/auth/login", json={"login_id": login_id, "password": password})
    assert res.status_code == 200, res.text
    body = res.json()
    return body["access_token"], body["user"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_three_warehouses(db_session: Session) -> dict[str, object]:
    return seed_warehouse_accounts(db_session, default_password="TestPassword123!")


def _receive_stock(
    client: TestClient,
    token: str,
    *,
    plant_id: int,
    sku_id: int,
    qty: int,
    ext_id: str,
    seq: int,
) -> None:
    res = client.post(
        "/events",
        headers=_auth_headers(token),
        json={
            "source": "mobile-test",
            "external_event_id": ext_id,
            "plant_id": plant_id,
            "sku_id": sku_id,
            "event_type": "STOCK_RECEIVED",
            "quantity": qty,
            "source_sequence": seq,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {},
        },
    )
    assert res.status_code == 201, res.text


def test_warehouse_a_cannot_access_warehouse_b_inventory_or_orders(
    client: TestClient, db_session: Session
) -> None:
    """Tests A, F, G: Warehouse A cannot access B's inventory, events, orders, or spoof plant_id."""
    seeded = _seed_three_warehouses(db_session)
    plant_a = seeded["plants"]["Mangaluru"]
    plant_b = seeded["plants"]["Udupi"]
    sku_id = seeded["skus"]["Electric fans"]

    token_a, user_a = _login(client, "wh-mangaluru", "TestPassword123!")
    token_b, user_b = _login(client, "wh-udupi", "TestPassword123!")
    assert user_a["plant_id"] == plant_a
    assert user_b["plant_id"] == plant_b

    # B receives stock and creates a private order
    _receive_stock(client, token_b, plant_id=plant_b, sku_id=sku_id, qty=100, ext_id="B-REC-1", seq=1)
    order_b_res = client.post(
        "/orders",
        headers=_auth_headers(token_b),
        json={
            "order_number": "ORD-B-PRIVATE-1",
            "customer_name": "Private B Customer",
            "plant_id": plant_b,
            "sku_id": sku_id,
            "quantity": 20,
            "requested_delivery_date": "2026-12-05T10:00:00Z",
        },
    )
    assert order_b_res.status_code == 201, order_b_res.text
    order_b_id = order_b_res.json()["id"]

    # A cannot query B's stock or submit events for B (Requirement A & G)
    assert client.get(f"/stock?plant_id={plant_b}", headers=_auth_headers(token_a)).status_code == 403
    assert client.get(f"/stock/{plant_b}", headers=_auth_headers(token_a)).status_code == 403
    assert client.get(f"/stock/{plant_b}/{sku_id}", headers=_auth_headers(token_a)).status_code == 403
    assert client.get(f"/events?plant_id={plant_b}", headers=_auth_headers(token_a)).status_code == 403
    spoof_event = client.post(
        "/events",
        headers=_auth_headers(token_a),
        json={
            "source": "mobile-test",
            "external_event_id": "SPOOF-A-TO-B",
            "plant_id": plant_b,
            "sku_id": sku_id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 50,
            "source_sequence": 1,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {},
        },
    )
    assert spoof_event.status_code == 403

    # A cannot view B's private orders (Requirement F & G)
    assert client.get(f"/orders?plant_id={plant_b}", headers=_auth_headers(token_a)).status_code == 403
    assert client.get(f"/orders/{order_b_id}", headers=_auth_headers(token_a)).status_code == 403
    orders_a = client.get("/orders", headers=_auth_headers(token_a)).json()
    assert orders_a["total"] == 0


def test_network_availability_and_request_lifecycle_privacy(
    client: TestClient, db_session: Session
) -> None:
    """Tests B, C, D, E, H, I: Read-only network visibility, request privacy, no silent stock change, no duplicate dispatch."""
    seeded = _seed_three_warehouses(db_session)
    plant_a = seeded["plants"]["Mangaluru"]
    plant_b = seeded["plants"]["Udupi"]
    sku_id = seeded["skus"]["Electric fans"]

    token_a, _ = _login(client, "wh-mangaluru", "TestPassword123!")
    token_b, _ = _login(client, "wh-udupi", "TestPassword123!")
    token_c, _ = _login(client, "wh-manipal", "TestPassword123!")

    _receive_stock(client, token_b, plant_id=plant_b, sku_id=sku_id, qty=120, ext_id="B-REC-2", seq=1)

    # B: Warehouse A can view limited availability at B and C, but NOT A itself
    avail_res = client.get("/network/availability", headers=_auth_headers(token_a))
    assert avail_res.status_code == 200
    avail_items = avail_res.json()["items"]
    assert all(item["plant_id"] != plant_a for item in avail_items)
    b_fan = next(i for i in avail_items if i["plant_id"] == plant_b and i["sku_id"] == sku_id)
    assert b_fan["available_stock"] == 120
    assert b_fan["availability_status"] == "IN_STOCK"

    # C: Warehouse A requests 40 fans from Warehouse B (cannot spoof requesting_plant_id or request from self)
    assert (
        client.post(
            "/network/requests",
            headers=_auth_headers(token_a),
            json={"supplying_plant_id": plant_a, "sku_id": sku_id, "requested_qty": 10},
        ).status_code
        == 422
    )
    req_res = client.post(
        "/network/requests",
        headers=_auth_headers(token_a),
        json={
            "supplying_plant_id": plant_b,
            "sku_id": sku_id,
            "requested_qty": 40,
            "reason": "Urgent assembly line replenishment",
            "idempotency_key": "req-a-to-b-001",
        },
    )
    assert req_res.status_code == 201, req_res.text
    req_id = req_res.json()["id"]
    assert req_res.json()["status"] == "PENDING"

    # E: Warehouse C must NOT see requests between A and B
    c_list = client.get("/network/requests", headers=_auth_headers(token_c)).json()
    assert c_list["count"] == 0
    assert client.get(f"/network/requests/{req_id}", headers=_auth_headers(token_c)).status_code == 403

    # D & H: Warehouse A cannot approve its own request; B approves 30 (PARTIALLY_APPROVED), stock unchanged!
    assert (
        client.post(
            f"/network/requests/{req_id}/approve",
            headers=_auth_headers(token_a),
            json={"approved_qty": 30},
        ).status_code
        == 403
    )
    approve_res = client.post(
        f"/network/requests/{req_id}/approve",
        headers=_auth_headers(token_b),
        json={"approved_qty": 30},
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "PARTIALLY_APPROVED"

    # H: Stock at B must STILL be 120 and A must STILL be 0 after approval
    b_stock_after_approve = client.get(f"/stock/{plant_b}/{sku_id}", headers=_auth_headers(token_b)).json()
    assert b_stock_after_approve["physical_stock"] == 120
    a_stock_after_approve = client.get(f"/stock/{plant_a}/{sku_id}", headers=_auth_headers(token_a)).json()
    assert a_stock_after_approve["physical_stock"] == 0

    # I: Warehouse B dispatches 30 -> stock at B drops to 90; duplicate dispatch is blocked (409)
    disp_res = client.post(f"/network/requests/{req_id}/dispatch", headers=_auth_headers(token_b))
    assert disp_res.status_code == 200, disp_res.text
    assert disp_res.json()["status"] == "DISPATCHED"
    assert disp_res.json()["dispatched_qty"] == 30
    assert (
        client.post(f"/network/requests/{req_id}/dispatch", headers=_auth_headers(token_b)).status_code
        == 409
    )

    b_stock_after_dispatch = client.get(f"/stock/{plant_b}/{sku_id}", headers=_auth_headers(token_b)).json()
    assert b_stock_after_dispatch["physical_stock"] == 90

    # Warehouse A confirms receipt -> stock at A increases to 30 and status becomes FULFILLED
    recv_res = client.post(f"/network/requests/{req_id}/receive", headers=_auth_headers(token_a))
    assert recv_res.status_code == 200, recv_res.text
    assert recv_res.json()["status"] == "FULFILLED"
    assert recv_res.json()["received_qty"] == 30

    a_stock_after_recv = client.get(f"/stock/{plant_a}/{sku_id}", headers=_auth_headers(token_a)).json()
    assert a_stock_after_recv["physical_stock"] == 30


def test_warehouse_b_reject_flow(client: TestClient, db_session: Session) -> None:
    """Test D: Warehouse B can reject a pending request with a reason."""
    seeded = _seed_three_warehouses(db_session)
    plant_b = seeded["plants"]["Udupi"]
    sku_id = seeded["skus"]["Motors"]

    token_a, _ = _login(client, "wh-mangaluru", "TestPassword123!")
    token_b, _ = _login(client, "wh-udupi", "TestPassword123!")

    req_res = client.post(
        "/network/requests",
        headers=_auth_headers(token_a),
        json={"supplying_plant_id": plant_b, "sku_id": sku_id, "requested_qty": 15},
    )
    req_id = req_res.json()["id"]

    rej_res = client.post(
        f"/network/requests/{req_id}/reject",
        headers=_auth_headers(token_b),
        json={"rejection_reason": "Reserved for local production batch"},
    )
    assert rej_res.status_code == 200
    assert rej_res.json()["status"] == "REJECTED"
    assert rej_res.json()["rejection_reason"] == "Reserved for local production batch"
