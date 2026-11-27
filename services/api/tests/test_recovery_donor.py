"""Tests for donor eligibility engine."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.fulfilment.recovery.donor import find_eligible_donors
from app.models import CustomerOrder, RecoveryType


def test_donor_eligibility_never_takes_reserved_stock_without_replenishment(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify reserved stock is excluded from surplus donors and unsafe swaps are rejected."""
    mangaluru = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    # Mangaluru has 20 fans, all allocated to an order
    assert client.post(
        "/events",
        json={
            "source": "wms-mng",
            "external_event_id": "don-mng-20",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 20,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    donor_order = client.post(
        "/orders",
        json={
            "order_number": "DON-ORD-1",
            "customer_name": "Donor Cust",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "quantity": 20,
            "requested_delivery_date": "2026-12-10T10:00:00Z",
        },
    ).json()
    assert client.post(f"/orders/allocate?order_id={donor_order['id']}").status_code == 200

    target_order_resp = client.post(
        "/orders",
        json={
            "order_number": "TGT-ORD-1",
            "customer_name": "Target Cust",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 10,
            "requested_delivery_date": "2026-12-02T10:00:00Z",
        },
    ).json()
    target_order = db_session.get(CustomerOrder, target_order_resp["id"])
    assert target_order is not None

    # No surplus AND no replenishment -> zero eligible donors
    assert find_eligible_donors(db_session, target_order, 10) == []

    # Add a production batch at Mangaluru completing before 2026-12-10 -> ORDER_SWAP becomes eligible
    assert client.post(
        "/production/batches",
        json={
            "batch_code": "BATCH-DON-1",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "planned_quantity": 15,
            "expected_completion_at": "2026-12-08T10:00:00Z",
            "required_components": [],
            "reserve_components": False,
        },
    ).status_code == 201

    donors = find_eligible_donors(db_session, target_order, 10)
    assert len(donors) == 1
    assert donors[0].recovery_type == RecoveryType.ORDER_SWAP
    assert donors[0].donor_order_id == donor_order["id"]
    assert donors[0].max_donatable_quantity == 10
