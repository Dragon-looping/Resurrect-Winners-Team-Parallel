"""End-to-end integration tests for the complete SETUVYUHA godown recovery workflow."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.fulfilment.recovery.demo import seed_godown_recovery_demo


def test_end_to_end_godown_recovery_across_mangaluru_udupi_manipal(
    client: TestClient,
    db_session: Session,
) -> None:
    """Verify full recovery search, below-margin rejection, preview, and atomic approval."""
    demo = seed_godown_recovery_demo(db_session)
    seeded = demo["seeded"]  # type: ignore[assignment]
    plants = seeded["catalog"]["plants"]  # type: ignore[index]
    skus = seeded["catalog"]["skus"]  # type: ignore[index]

    mangaluru_id = plants["Mangaluru"]
    udupi_id = plants["Udupi"]
    manipal_id = plants["Manipal"]
    motors_id = skus["Motors"]

    # Mangaluru has 20 surplus motors; Manipal has 10 surplus motors
    assert client.post(
        "/events",
        json={
            "source": "wms-mng",
            "external_event_id": "rec-e2e-mng-20",
            "plant_id": mangaluru_id,
            "sku_id": motors_id,
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
            "external_event_id": "rec-e2e-mnp-10",
            "plant_id": manipal_id,
            "sku_id": motors_id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 10,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    # Udupi order DEMO-UDP-001 needs 15 motors
    udp_oid = seeded["orders"]["DEMO-UDP-001"]  # type: ignore[index]

    search = client.post(
        "/recovery/search",
        json={"target_order_id": udp_oid, "evaluated_at": "2026-11-27T10:00:00Z"},
    )
    assert search.status_code == 200
    options = search.json()["options"]
    assert len(options) == 2
    assert all(o["is_feasible"] for o in options)

    # Preview with unrealistic 95% margin floor -> rejected, cannot be approved
    bad_preview = client.post(
        "/recovery/swaps/preview",
        json={
            "target_order_id": udp_oid,
            "donor_plant_id": mangaluru_id,
            "quantity": 15,
            "margin_floor_pct": 95.0,
            "evaluated_at": "2026-11-27T10:00:00Z",
        },
    ).json()
    assert bad_preview["is_feasible"] is False
    assert client.post(f"/recovery/swaps/{bad_preview['id']}/approve").status_code == 422

    # Valid preview and human approval
    good_preview = client.post(
        "/recovery/swaps/preview",
        json={
            "target_order_id": udp_oid,
            "donor_plant_id": mangaluru_id,
            "quantity": 15,
            "evaluated_at": "2026-11-27T10:00:00Z",
        },
    ).json()
    assert good_preview["is_feasible"] is True

    approved = client.post(
        f"/recovery/swaps/{good_preview['id']}/approve",
        json={"actor": "ops-director"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"

    # Verify Mangaluru stock decreased by 15, Udupi order is ALLOCATED, CRD preserved
    assert client.get(f"/stock/{mangaluru_id}/{motors_id}").json()["available_stock"] == 5
    udp_order = client.get(f"/orders/{udp_oid}").json()
    assert udp_order["allocated_quantity"] == 15
    assert udp_order["status"] == "ALLOCATED"
    assert udp_order["customer_request_date"] == udp_order["agreed_delivery_date"]
