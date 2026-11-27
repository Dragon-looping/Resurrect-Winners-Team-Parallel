"""Tests for stock balance calculations, reservations, date D projections, and out-of-order events."""

from datetime import date, datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.inventory.engine import calculate_stock_snapshot
from app.models import InventoryBalance, InventoryEvent


def test_stock_balance_receipts_dispatches_reservations_and_releases(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify physical, reserved, and available stock update accurately and stay separate."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    motors = seeded_catalog["skus"]["Motors"]  # type: ignore[index]

    events = [
        ("evt-1", "STOCK_RECEIVED", 100, 1, "2026-11-27T08:00:00Z"),
        ("evt-2", "STOCK_DISPATCHED", 30, 2, "2026-11-27T09:00:00Z"),
        ("evt-3", "STOCK_RESERVED", 25, 3, "2026-11-27T10:00:00Z"),
        ("evt-4", "STOCK_RELEASED", 10, 4, "2026-11-27T11:00:00Z"),
    ]
    for ext_id, etype, qty, seq, ts in events:
        resp = client.post(
            "/events",
            json={
                "source": "erp",
                "external_event_id": ext_id,
                "plant_id": udupi.id,
                "sku_id": motors.id,
                "event_type": etype,
                "quantity": qty,
                "source_sequence": seq,
                "occurred_at": ts,
            },
        )
        assert resp.status_code == 201

    balance = db_session.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == udupi.id,
            InventoryBalance.sku_id == motors.id,
        )
    ).scalar_one()

    assert balance.physical_stock == 70
    assert balance.reserved_stock == 15
    assert balance.confirmed_arrivals == 0
    assert balance.available_stock == 55


def test_stock_is_isolated_per_plant_and_sku(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify events at one plant/SKU do not leak into another plant/SKU."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    mangaluru = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]
    motors = seeded_catalog["skus"]["Motors"]  # type: ignore[index]

    assert client.post(
        "/events",
        json={
            "source": "erp",
            "external_event_id": "iso-1",
            "plant_id": udupi.id,
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
            "source": "erp",
            "external_event_id": "iso-2",
            "plant_id": mangaluru.id,
            "sku_id": motors.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 12,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    b1 = db_session.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == udupi.id,
            InventoryBalance.sku_id == fans.id,
        )
    ).scalar_one()
    b2 = db_session.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == mangaluru.id,
            InventoryBalance.sku_id == motors.id,
        )
    ).scalar_one()

    assert b1.physical_stock == 50
    assert b2.physical_stock == 12


def test_prevents_negative_physical_or_over_reserved_stock(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify business rules block dispatches, releases, and reservations exceeding stock."""
    manipal = seeded_catalog["plants"]["Manipal"]  # type: ignore[index]
    copper = seeded_catalog["skus"]["Copper wire"]  # type: ignore[index]

    assert client.post(
        "/events",
        json={
            "source": "wms",
            "external_event_id": "base-1",
            "plant_id": manipal.id,
            "sku_id": copper.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 30,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    over_dispatch = client.post(
        "/events",
        json={
            "source": "wms",
            "external_event_id": "over-dispatch",
            "plant_id": manipal.id,
            "sku_id": copper.id,
            "event_type": "STOCK_DISPATCHED",
            "quantity": 31,
            "source_sequence": 2,
            "occurred_at": "2026-11-27T09:00:00Z",
        },
    )
    assert over_dispatch.status_code == 422

    over_reserve = client.post(
        "/events",
        json={
            "source": "wms",
            "external_event_id": "over-reserve",
            "plant_id": manipal.id,
            "sku_id": copper.id,
            "event_type": "STOCK_RESERVED",
            "quantity": 40,
            "source_sequence": 3,
            "occurred_at": "2026-11-27T09:05:00Z",
        },
    )
    assert over_reserve.status_code == 422

    over_release = client.post(
        "/events",
        json={
            "source": "wms",
            "external_event_id": "over-release",
            "plant_id": manipal.id,
            "sku_id": copper.id,
            "event_type": "STOCK_RELEASED",
            "quantity": 5,
            "source_sequence": 4,
            "occurred_at": "2026-11-27T09:10:00Z",
        },
    )
    assert over_release.status_code == 422

    balance = db_session.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == manipal.id,
            InventoryBalance.sku_id == copper.id,
        )
    ).scalar_one()
    assert balance.physical_stock == 30
    assert balance.reserved_stock == 0
    assert balance.available_stock == 30


def test_out_of_order_events_produce_deterministic_balance(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify earlier-timestamped events arriving later recalculate stock deterministically."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]

    # Sequence 1 arrives first (100 units at 08:00)
    assert client.post(
        "/events",
        json={
            "source": "erp",
            "external_event_id": "ooo-1",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 100,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T08:00:00Z",
        },
    ).status_code == 201

    # Sequence 3 arrives before sequence 2 (physical count 40 at 10:00)
    assert client.post(
        "/events",
        json={
            "source": "erp",
            "external_event_id": "ooo-3",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "PHYSICAL_COUNT",
            "quantity": 40,
            "source_sequence": 3,
            "occurred_at": "2026-11-27T10:00:00Z",
        },
    ).status_code == 201

    # Sequence 2 arrives late (dispatch 10 at 09:00, BEFORE physical count at 10:00)
    assert client.post(
        "/events",
        json={
            "source": "erp",
            "external_event_id": "ooo-2",
            "plant_id": udupi.id,
            "sku_id": fans.id,
            "event_type": "STOCK_DISPATCHED",
            "quantity": 10,
            "source_sequence": 2,
            "occurred_at": "2026-11-27T09:00:00Z",
        },
    ).status_code == 201

    balance = db_session.execute(
        select(InventoryBalance).where(
            InventoryBalance.plant_id == udupi.id,
            InventoryBalance.sku_id == fans.id,
        )
    ).scalar_one()
    # Because PHYSICAL_COUNT(40) occurred at 10:00 AFTER dispatch(10) at 09:00, physical stock must still be 40
    assert balance.physical_stock == 40
    assert balance.available_stock == 40


def test_available_stock_on_date_d_includes_confirmed_arrivals_minus_reserved(
    client: TestClient,
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify Available stock = Physical stock + confirmed arrivals by D - reserved units by D."""
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    motors = seeded_catalog["skus"]["Motors"]  # type: ignore[index]

    ref_now = datetime(2026, 11, 27, 12, 0, tzinfo=timezone.utc)

    # Current physical receipt (already arrived)
    assert client.post(
        "/events",
        json={
            "source": "erp",
            "external_event_id": "d-phys",
            "plant_id": udupi.id,
            "sku_id": motors.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 50,
            "source_sequence": 1,
            "occurred_at": "2026-11-27T10:00:00Z",
        },
    ).status_code == 201

    # Confirmed arrival scheduled for 2026-11-29
    assert client.post(
        "/events",
        json={
            "source": "erp",
            "external_event_id": "d-arrival",
            "plant_id": udupi.id,
            "sku_id": motors.id,
            "event_type": "STOCK_RECEIVED",
            "quantity": 30,
            "source_sequence": 2,
            "occurred_at": "2026-11-29T09:00:00Z",
            "metadata": {"confirmed_arrival": True},
        },
    ).status_code == 201

    # Reservation on 2026-11-28
    assert client.post(
        "/events",
        json={
            "source": "erp",
            "external_event_id": "d-reserve",
            "plant_id": udupi.id,
            "sku_id": motors.id,
            "event_type": "STOCK_RESERVED",
            "quantity": 20,
            "source_sequence": 3,
            "occurred_at": "2026-11-28T15:00:00Z",
        },
    ).status_code == 201

    events = db_session.execute(
        select(InventoryEvent).where(
            InventoryEvent.plant_id == udupi.id,
            InventoryEvent.sku_id == motors.id,
        )
    ).scalars().all()

    snap_nov27 = calculate_stock_snapshot(
        udupi.id, motors.id, events, as_of=date(2026, 11, 27), reference_now=ref_now
    )
    assert snap_nov27.physical_stock == 50
    assert snap_nov27.confirmed_arrivals == 0
    assert snap_nov27.reserved_stock == 0
    assert snap_nov27.available_stock == 50

    snap_nov28 = calculate_stock_snapshot(
        udupi.id, motors.id, events, as_of=date(2026, 11, 28), reference_now=ref_now
    )
    assert snap_nov28.physical_stock == 50
    assert snap_nov28.confirmed_arrivals == 0
    assert snap_nov28.reserved_stock == 20
    assert snap_nov28.available_stock == 30

    snap_nov29 = calculate_stock_snapshot(
        udupi.id, motors.id, events, as_of=date(2026, 11, 29), reference_now=ref_now
    )
    assert snap_nov29.physical_stock == 50
    assert snap_nov29.confirmed_arrivals == 30
    assert snap_nov29.reserved_stock == 20
    assert snap_nov29.available_stock == 60
