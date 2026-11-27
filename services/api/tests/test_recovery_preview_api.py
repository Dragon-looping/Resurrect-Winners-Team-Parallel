"""Tests for recovery search and swap preview APIs."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import RecoveryRoute


def test_recovery_search_preview_and_get_do_not_mutate_stock(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify POST /recovery/search and /recovery/swaps/preview explain options without executing."""
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

    assert client.post(
        "/events",
        json={
            "source": "wms-mng",
            "external_event_id": "prev-mng-30",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 30,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    target = client.post(
        "/orders",
        json={
            "order_number": "PREV-ORD-1",
            "customer_name": "Udupi Buyer",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 10,
            "requested_delivery_date": "2026-12-05T10:00:00Z",
        },
    ).json()

    search = client.post(
        "/recovery/search",
        json={"target_order_id": target["id"], "evaluated_at": "2026-11-27T10:00:00Z"},
    )
    assert search.status_code == 200
    assert len(search.json()["options"]) == 1
    assert search.json()["options"][0]["is_feasible"] is True

    preview = client.post(
        "/recovery/swaps/preview",
        json={
            "target_order_id": target["id"],
            "donor_plant_id": mangaluru.id,
            "quantity": 10,
            "evaluated_at": "2026-11-27T10:00:00Z",
        },
    )
    assert preview.status_code == 201
    p_body = preview.json()
    assert p_body["status"] == "PREVIEW"
    assert p_body["is_feasible"] is True

    fetched = client.get(f"/recovery/{p_body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == p_body["id"]
    assert client.get("/recovery/9999").status_code == 404

    # Stock must remain untouched after preview
    assert client.get(f"/stock/{mangaluru.id}/{fans.id}").json()["available_stock"] == 30
    assert client.get(f"/stock/{udupi.id}/{fans.id}").json()["available_stock"] == 0
