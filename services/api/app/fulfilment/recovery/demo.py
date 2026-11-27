"""Deterministic demo fixtures for inter-godown recovery routes across Mangaluru, Udupi, and Manipal."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.demo import seed_order_lifecycle_demo
from app.models import RecoveryRoute


def seed_godown_recovery_demo(db: Session) -> dict[str, object]:
    """Idempotently seed canonical demo routes across Mangaluru, Udupi, and Manipal."""
    seeded = seed_order_lifecycle_demo(db)
    plants = seeded["catalog"]["plants"]  # type: ignore[index]

    route_specs = [
        (plants["Mangaluru"], plants["Udupi"], 2, 20, 15.0, 150.0),
        (plants["Manipal"], plants["Udupi"], 1, 22, 10.0, 100.0),
        (plants["Udupi"], plants["Mangaluru"], 2, 20, 15.0, 150.0),
        (plants["Mangaluru"], plants["Manipal"], 3, 20, 18.0, 180.0),
    ]

    route_ids: list[int] = []
    for from_id, to_id, transit_h, cutoff_h, per_unit, fixed in route_specs:
        existing = db.execute(
            select(RecoveryRoute).where(
                RecoveryRoute.from_plant_id == from_id,
                RecoveryRoute.to_plant_id == to_id,
            )
        ).scalar_one_or_none()
        if existing is None:
            route = RecoveryRoute(
                from_plant_id=from_id,
                to_plant_id=to_id,
                transit_hours=transit_h,
                truck_cutoff_hour_utc=cutoff_h,
                freight_cost_per_unit=per_unit,
                fixed_dispatch_cost=fixed,
                is_active=True,
            )
            db.add(route)
            db.flush()
            route_ids.append(route.id)
        else:
            route_ids.append(existing.id)

    db.commit()
    return {"seeded": seeded, "route_ids": route_ids}
