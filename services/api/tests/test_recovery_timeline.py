"""Tests for route availability, truck cutoff, and delivery window validation."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.fulfilment.recovery.timeline import evaluate_route_timeline
from app.models import RecoveryRoute


def test_route_cutoff_and_delivery_deadline_validation(
    db_session: Session,
    seeded_catalog: dict[str, object],
) -> None:
    """Verify truck cutoff shifts dispatch to next day and rejects late deliveries."""
    mangaluru = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    udupi = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]

    route = RecoveryRoute(
        from_plant_id=mangaluru.id,
        to_plant_id=udupi.id,
        transit_hours=4,
        truck_cutoff_hour_utc=12,
        freight_cost_per_unit=10.0,
        fixed_dispatch_cost=100.0,
        is_active=True,
    )
    db_session.add(route)
    db_session.commit()

    # Before cutoff (10:00 UTC) -> dispatches 12:00 UTC, arrives 16:00 UTC
    before = evaluate_route_timeline(
        db_session,
        from_plant_id=mangaluru.id,
        to_plant_id=udupi.id,
        delivery_deadline=datetime(2026, 11, 27, 18, 0, tzinfo=timezone.utc),
        now=datetime(2026, 11, 27, 10, 0, tzinfo=timezone.utc),
    )
    assert before.is_on_time is True
    assert before.estimated_delivery_at == datetime(2026, 11, 27, 16, 0, tzinfo=timezone.utc)

    # After cutoff (13:00 UTC) -> shifts to next day 12:00 UTC -> arrives Nov 28 16:00 UTC -> misses Nov 27 18:00 deadline
    after = evaluate_route_timeline(
        db_session,
        from_plant_id=mangaluru.id,
        to_plant_id=udupi.id,
        delivery_deadline=datetime(2026, 11, 27, 18, 0, tzinfo=timezone.utc),
        now=datetime(2026, 11, 27, 13, 0, tzinfo=timezone.utc),
    )
    assert after.is_on_time is False
    assert any("misses agreed delivery deadline" in r for r in after.rejection_reasons)
