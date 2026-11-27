"""Tests for multi-godown stock discovery across Mangaluru, Udupi, and Manipal."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.fulfilment.recovery.discovery import discover_godown_stock


def test_discover_godown_stock_across_plants_respects_reserved_stock(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify multi-godown discovery reports physical, reserved, and available stock accurately."""
    mangaluru = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    manipal = seeded_catalog["plants"]["Manipal"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    assert client.post(
        "/events",
        json={
            "source": "wms-mng",
            "external_event_id": "disc-mng-50",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 50,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    assert client.post(
        "/events",
        json={
            "source": "wms-mng",
            "external_event_id": "disc-mng-res-20",
            "plant_id": mangaluru.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RESERVED",
            "quantity": 20,
            "source_sequence": 2,
            "occurred_at": "2026-11-27T09:00:00Z",
        },
    ).status_code == 201

    assert client.post(
        "/events",
        json={
            "source": "wms-mnp",
            "external_event_id": "disc-mnp-15",
            "plant_id": manipal.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 15,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    views = discover_godown_stock(db_session, sku_id=fans.id, exclude_plant_id=udupi.id)
    by_name = {v.plant_name: v for v in views}
    assert set(by_name.keys()) == {"Mangaluru", "Manipal"}
    assert by_name["Mangaluru"].physical_stock == 50
    assert by_name["Mangaluru"].reserved_stock == 20
    assert by_name["Mangaluru"].available_stock == 30
    assert by_name["Manipal"].available_stock == 15
