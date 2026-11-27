"""Tests for transactional recovery approval, atomic swaps, and version revalidation."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import RecoveryRoute


def test_atomic_order_swap_approval_and_stale_version_rejection(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify ORDER_SWAP approval updates both orders atomically and rejects stale versions."""
    mangaluru = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    db_session.add(
        RecoveryRoute(
            from_plant_id=mangaluru.id,
            to_plant_id=udupi.id,
            transit_hours=2,
            truck_cutoff_hour_utc=23,
            freight_cost_per_unit=15.0,
            fixed_dispatch_cost=100.0,
            is_active=True,
        )
    )
    db_session.commit()

    # Mangaluru has 20 fans allocated to a later-deadline order + 20 in production
    assert client.post(
        "/events",
        json={
            "source": "wms-mng",
            "external_event_id": "app-mng-20",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 20,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    donor = client.post(
        "/orders",
        json={
            "order_number": "APP-DON-1",
            "customer_name": "Donor Later",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "quantity": 20,
            "requested_delivery_date": "2026-12-15T10:00:00Z",
        },
    ).json()
    assert client.post(f"/orders/allocate?order_id={donor['id']}").status_code == 200

    assert client.post(
        "/production/batches",
        json={
            "batch_code": "BATCH-APP-1",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "planned_quantity": 20,
            "expected_completion_at": "2026-12-12T10:00:00Z",
            "required_components": [],
            "reserve_components": False,
        },
    ).status_code == 201

    target = client.post(
        "/orders",
        json={
            "order_number": "APP-TGT-1",
            "customer_name": "Target Urgent",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 10,
            "requested_delivery_date": "2026-12-05T10:00:00Z",
        },
    ).json()

    # Stale preview test
    stale_preview = client.post(
        "/recovery/swaps/preview",
        json={
            "target_order_id": target["id"],
            "donor_plant_id": mangaluru.id,
            "donor_order_id": donor["id"],
            "quantity": 10,
            "evaluated_at": "2026-11-27T10:00:00Z",
        },
    ).json()

    # Mutate Mangaluru stock -> stale_preview approval must fail 409
    assert client.post(
        "/events",
        json={
            "source": "wms-mng",
            "external_event_id": "app-mng-extra-5",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 5,
            "source_sequence": 2,
            "occurred_at": "2026-11-27T09:00:00Z",
        },
    ).status_code == 201
    assert client.post(f"/recovery/swaps/{stale_preview['id']}/approve").status_code == 409

    # Fresh preview and atomic approval
    fresh_preview = client.post(
        "/recovery/swaps/preview",
        json={
            "target_order_id": target["id"],
            "donor_plant_id": mangaluru.id,
            "donor_order_id": donor["id"],
            "quantity": 10,
            "evaluated_at": "2026-11-27T10:00:00Z",
        },
    ).json()
    approved = client.post(
        f"/recovery/swaps/{fresh_preview['id']}/approve",
        json={"actor": "ops-lead"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"

    target_after = client.get(f"/orders/{target['id']}").json()
    donor_after = client.get(f"/orders/{donor['id']}").json()
    assert target_after["allocated_quantity"] == 10
    assert target_after["status"] == "ALLOCATED"
    assert donor_after["allocated_quantity"] == 10
    assert donor_after["status"] == "PARTIALLY_ALLOCATED"
    # CRD preserved on both orders
    assert target_after["customer_request_date"].startswith("2026-12-05")
    assert donor_after["customer_request_date"].startswith("2026-12-15")
