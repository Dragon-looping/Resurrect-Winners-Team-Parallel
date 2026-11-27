"""Tests for recovery audit trail and alternatives endpoint."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import RecoveryRoute


def test_recovery_alternatives_and_audit_trail(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify GET /recovery/{id}/alternatives lists alternative godowns and audit logs."""
    mangaluru = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    manipal = seeded_catalog["plants"]["Manipal"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    # Active route from Mangaluru -> Udupi, no route from Manipal -> Udupi
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

    assert client.post(
        "/events",
        json={
            "source": "wms-mng",
            "external_event_id": "alt-mng-20",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 20,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    assert client.post(
        "/events",
        json={
            "source": "wms-mnp",
            "external_event_id": "alt-mnp-20",
            "plant_id": manipal.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 20,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    target = client.post(
        "/orders",
        json={
            "order_number": "ALT-TGT-1",
            "customer_name": "Alt Buyer",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 10,
            "requested_delivery_date": "2026-12-05T10:00:00Z",
        },
    ).json()

    preview = client.post(
        "/recovery/swaps/preview",
        json={
            "target_order_id": target["id"],
            "donor_plant_id": mangaluru.id,
            "quantity": 10,
            "evaluated_at": "2026-11-27T10:00:00Z",
        },
    ).json()

    assert client.post(
        f"/recovery/swaps/{preview['id']}/approve",
        json={"actor": "ops-manager"},
    ).status_code == 200

    alt_resp = client.get(f"/recovery/{preview['id']}/alternatives")
    assert alt_resp.status_code == 200
    body = alt_resp.json()
    assert len(body["alternatives"]) == 1
    assert body["alternatives"][0]["donor_plant_name"] == "Manipal"
    assert body["alternatives"][0]["is_feasible"] is False
    assert [log["action"] for log in body["audit_logs"]] == ["PREVIEW", "APPROVED"]
