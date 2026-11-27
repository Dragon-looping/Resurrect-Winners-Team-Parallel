"""Route availability, truck cutoff, transit time, and delivery window validation."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.inventory.engine import normalize_utc
from app.models import RecoveryRoute


@dataclass(frozen=True, slots=True)
class TimelineEvaluation:
    """Result of evaluating logistics route and delivery window feasibility."""

    route: RecoveryRoute | None
    dispatch_at: datetime | None
    estimated_delivery_at: datetime | None
    is_on_time: bool
    rejection_reasons: list[str]


def evaluate_route_timeline(
    db: Session,
    *,
    from_plant_id: int,
    to_plant_id: int,
    delivery_deadline: datetime,
    now: datetime | None = None,
) -> TimelineEvaluation:
    """Validate route availability, truck cutoff, transit time, and delivery deadline."""
    route = db.execute(
        select(RecoveryRoute).where(
            RecoveryRoute.from_plant_id == from_plant_id,
            RecoveryRoute.to_plant_id == to_plant_id,
        )
    ).scalar_one_or_none()

    if route is None or not route.is_active:
        return TimelineEvaluation(
            route=route,
            dispatch_at=None,
            estimated_delivery_at=None,
            is_on_time=False,
            rejection_reasons=[
                f"No active recovery route from plant_id={from_plant_id} to plant_id={to_plant_id}."
            ],
        )

    now_utc = normalize_utc(now) if now else datetime.now(timezone.utc)
    cutoff_today = now_utc.replace(
        hour=route.truck_cutoff_hour_utc, minute=0, second=0, microsecond=0
    )
    dispatch_at = cutoff_today if now_utc < cutoff_today else cutoff_today + timedelta(days=1)
    estimated_delivery = dispatch_at + timedelta(hours=route.transit_hours)
    deadline_utc = normalize_utc(delivery_deadline)

    reasons: list[str] = []
    if estimated_delivery > deadline_utc:
        reasons.append(
            f"Estimated delivery ({estimated_delivery.isoformat()}) misses agreed delivery deadline ({deadline_utc.isoformat()})."
        )

    return TimelineEvaluation(
        route=route,
        dispatch_at=dispatch_at,
        estimated_delivery_at=estimated_delivery,
        is_on_time=len(reasons) == 0,
        rejection_reasons=reasons,
    )
