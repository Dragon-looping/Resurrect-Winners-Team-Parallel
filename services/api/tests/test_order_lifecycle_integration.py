"""End-to-end integration tests for the complete order lifecycle across Mangaluru, Udupi, and Manipal."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.fulfilment.demo import seed_order_lifecycle_demo


def test_end_to_end_order_lifecycle_across_three_plants(
    client: TestClient,
    db_session: Session,
) -> None:
    """Verify demo fixtures, priority tie-breaking, production supply, offers, and plan approval."""
    seeded = seed_order_lifecycle_demo(db_session)
    catalog = seeded["catalog"]  # type: ignore[assignment]
    plants = catalog["plants"]  # type: ignore[index]
    skus = catalog["skus"]  # type: ignore[index]

    udupi_id = plants["Udupi"]
    mangaluru_id = plants["Mangaluru"]
    manipal_id = plants["Manipal"]
    fans_id = skus["Electric fans"]
    motors_id = skus["Motors"]

    # Seed stock at Mangaluru (30 fans) and Udupi (10 motors, short of 15)
    assert client.post(
        "/events",
        json={
            "source": "wms-mangaluru",
            "external_event_id": "e2e-mng-fans-30",
            "plant_id": mangaluru_id,
            "sku_id": fans_id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 30,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    assert client.post(
        "/events",
        json={
            "source": "wms-udupi",
            "external_event_id": "e2e-udp-motors-10",
            "plant_id": udupi_id,
            "sku_id": motors_id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 10,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    # Allocate all orders
    alloc_resp = client.post("/orders/allocate")
    assert alloc_resp.status_code == 200

    # Mangaluru order (30 fans) is fully ALLOCATED
    mng_oid = seeded["orders"]["DEMO-MNG-001"]  # type: ignore[index]
    assert client.get(f"/orders/{mng_oid}").json()["status"] == "ALLOCATED"

    # Udupi order (15 motors, 10 available) is PARTIALLY_ALLOCATED
    udp_oid = seeded["orders"]["DEMO-UDP-001"]  # type: ignore[index]
    udp_order = client.get(f"/orders/{udp_oid}").json()
    assert udp_order["allocated_quantity"] == 10
    assert udp_order["status"] == "PARTIALLY_ALLOCATED"

    # Manipal order (200 copper wire, 0 available) is BACKLOGGED
    mnp_oid = seeded["orders"]["DEMO-MNP-001"]  # type: ignore[index]
    assert client.get(f"/orders/{mnp_oid}").json()["status"] == "BACKLOGGED"

    # Schedule production batch at Udupi for 10 more motors completing 2026-12-06
    batch = client.post(
        "/production/batches",
        json={
            "batch_code": "BATCH-UDP-MTR-01",
            "plant_id": udupi_id,
            "sku_id": motors_id,
            "planned_quantity": 10,
            "expected_completion_at": "2026-12-06T12:00:00Z",
            "required_components": [],
            "reserve_components": False,
        },
    )
    assert batch.status_code == 201

    # Plan preview for remaining 5 motors on 2026-12-07 is feasible thanks to production batch
    plan = client.post(
        f"/orders/{udp_oid}/plans",
        json={"proposed_delivery_date": "2026-12-07T15:00:00Z", "planned_quantity": 5},
    ).json()
    assert plan["is_feasible"] is True
    assert plan["plan_details"]["production_supply"] == 10

    # Approve plan transactionally -> agreed_delivery_date updated, CRD preserved!
    approved = client.post(f"/plans/{plan['id']}/approve")
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"

    updated_udp = client.get(f"/orders/{udp_oid}").json()
    assert updated_udp["customer_request_date"].startswith("2026-12-07")
    assert updated_udp["agreed_delivery_date"].startswith("2026-12-07")

    # Tie-breaking test: two orders at Manipal with identical agreed_delivery_date
    o_first = client.post(
        "/orders",
        json={
            "order_number": "TIE-1",
            "customer_name": "Tie A",
            "plant_id": manipal_id,
            "sku_id": fans_id,
            "quantity": 10,
            "requested_delivery_date": "2026-12-10T10:00:00Z",
        },
    ).json()
    o_second = client.post(
        "/orders",
        json={
            "order_number": "TIE-2",
            "customer_name": "Tie B",
            "plant_id": manipal_id,
            "sku_id": fans_id,
            "quantity": 10,
            "requested_delivery_date": "2026-12-10T10:00:00Z",
        },
    ).json()
    assert client.post(
        "/events",
        json={
            "source": "wms-manipal",
            "external_event_id": "tie-seed-10",
            "plant_id": manipal_id,
            "sku_id": fans_id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 10,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201
    assert client.post(f"/orders/allocate?plant_id={manipal_id}&sku_id={fans_id}").status_code == 200
    assert client.get(f"/orders/{o_first['id']}").json()["status"] == "ALLOCATED"
    assert client.get(f"/orders/{o_second['id']}").json()["status"] == "BACKLOGGED"
