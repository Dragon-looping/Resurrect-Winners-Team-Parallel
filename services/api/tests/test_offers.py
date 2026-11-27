"""Tests for customer offers, replies, and permanent CRD preservation."""

from fastapi.testclient import TestClient


def test_offer_acceptance_updates_agreed_date_and_preserves_crd(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify accepting an offer updates agreed_delivery_date while keeping CRD unchanged."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    crd = "2026-12-01T10:00:00Z"
    new_date = "2026-12-08T10:00:00Z"

    order = client.post(
        "/orders",
        json={
            "order_number": "ORD-OFF-1",
            "customer_name": "Sunil Enterprises",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 10,
            "requested_delivery_date": crd,
        },
    ).json()

    offer = client.post(
        f"/orders/{order['id']}/offers",
        json={
            "proposed_delivery_date": new_date,
            "offered_quantity": 10,
            "offer_details": {"reason": "production schedule"},
        },
    )
    assert offer.status_code == 201
    oid = offer.json()["id"]

    reply = client.post(f"/offers/{oid}/reply", json={"accept": True, "note": "Approved"})
    assert reply.status_code == 200
    assert reply.json()["status"] == "ACCEPTED"

    # Re-replying must return 409
    assert client.post(f"/offers/{oid}/reply", json={"accept": False}).status_code == 409

    updated_order = client.get(f"/orders/{order['id']}").json()
    assert updated_order["status"] == "CONFIRMED"
    assert updated_order["customer_request_date"].startswith("2026-12-01")
    assert updated_order["agreed_delivery_date"].startswith("2026-12-08")


def test_offer_rejection_moves_order_to_backlogged(
    client: TestClient,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify rejecting an offer transitions order to BACKLOGGED."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    order = client.post(
        "/orders",
        json={
            "order_number": "ORD-OFF-2",
            "customer_name": "Reject Corp",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "quantity": 5,
            "requested_delivery_date": "2026-12-01T10:00:00Z",
        },
    ).json()

    offer = client.post(
        f"/orders/{order['id']}/offers",
        json={"proposed_delivery_date": "2026-12-10T10:00:00Z", "offered_quantity": 5},
    ).json()

    rep = client.post(f"/offers/{offer['id']}/reply", json={"accept": False, "note": "Too late"})
    assert rep.status_code == 200
    assert rep.json()["status"] == "REJECTED"
    assert client.get(f"/orders/{order['id']}").json()["status"] == "BACKLOGGED"
