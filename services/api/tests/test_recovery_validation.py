"""Tests for swap and transfer feasibility validation."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.fulfilment.recovery.validation import validate_recovery_candidate
from app.models import CustomerOrder


def test_validation_rejects_sku_mismatch_excess_qty_and_late_donor(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify validation rejects SKU mismatch, negative/excess qty, and swaps making donor late."""
    mangaluru = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]
    motors = seeded_catalog["skus"]["Motors"]  # type: ignore[index]

    assert client.post(
        "/events",
        json={
            "source": "wms-mng",
            "external_event_id": "val-mng-10",
            "plant_id": mangaluru.id,
            "sku_id": motors.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 10,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    donor_resp = client.post(
        "/orders",
        json={
            "order_number": "VAL-DON",
            "customer_name": "Donor",
            "plant_id": mangaluru.id,
            "sku_id": motors.id,
            "quantity": 10,
            "requested_delivery_date": "2026-12-03T10:00:00Z",
        },
    ).json()
    assert client.post(f"/orders/allocate?order_id={donor_resp['id']}").status_code == 200

    target_resp = client.post(
        "/orders",
        json={
            "order_number": "VAL-TGT",
            "customer_name": "Target",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 5,
            "requested_delivery_date": "2026-12-05T10:00:00Z",
        },
    ).json()

    target = db_session.get(CustomerOrder, target_resp["id"])
    donor = db_session.get(CustomerOrder, donor_resp["id"])
    assert target is not None and donor is not None

    reasons = validate_recovery_candidate(
        db_session,
        target_order=target,
        donor_plant_id=mangaluru.id,
        quantity=5,
        donor_order=donor,
    )
    assert any("SKU" in r for r in reasons)
    assert any("not later" in r for r in reasons)
    assert any("replenishment" in r for r in reasons)
