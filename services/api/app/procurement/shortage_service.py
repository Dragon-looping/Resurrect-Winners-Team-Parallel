"""Shortage detection integration connecting existing fulfilment risk engine to procurement."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.risk import OrderRiskItem, assess_backlog_and_risk
from app.inventory.engine import normalize_utc
from app.models import Plant, SKU
from app.models.enums import ProposalStatus, UrgencyLevel

ACTIVE_PROPOSAL_STATUSES: tuple[str, ...] = (
    ProposalStatus.DRAFT.value,
    ProposalStatus.PENDING_APPROVAL.value,
    ProposalStatus.APPROVED.value,
    ProposalStatus.ORDER_CREATED.value,
)


@dataclass(frozen=True)
class IntegratedShortageAlert:
    """Procurement-ready shortage alert derived from authoritative backlog & risk data."""

    shortage_ref: str
    order_id: int
    order_number: str
    customer_name: str
    plant_id: int
    plant_name: str
    plant_location: str
    sku_id: int
    sku_code: str
    sku_name: str
    unit: str
    agreed_delivery_date: datetime
    required_quantity: int
    available_quantity: int
    shortage_quantity: int
    urgency_level: UrgencyLevel
    severity_score: float
    risk_classification: str
    feed_is_stale: bool
    affected_departments: list[str]
    has_active_proposal: bool
    active_proposal_id: int | None
    active_proposal_code: str | None


def _compute_urgency(item: OrderRiskItem, now_utc: datetime) -> tuple[UrgencyLevel, float]:
    """Deterministically compute urgency level and severity score (0-100)."""
    due_utc = normalize_utc(item.agreed_delivery_date)
    hours_until_due = (due_utc - now_utc).total_seconds() / 3600.0
    shortage_ratio = (
        item.shortage_quantity / item.remaining_quantity
        if item.remaining_quantity > 0
        else 1.0
    )

    score = min(100.0, round(shortage_ratio * 60.0 + max(0.0, (72.0 - hours_until_due) / 72.0) * 40.0, 2))
    if hours_until_due <= 24 or (shortage_ratio >= 0.75 and item.shortage_quantity >= 25):
        return UrgencyLevel.CRITICAL, max(score, 85.0)
    if hours_until_due <= 48 or shortage_ratio >= 0.5:
        return UrgencyLevel.HIGH, max(score, 65.0)
    if hours_until_due <= 96 or item.shortage_quantity > 0:
        return UrgencyLevel.MEDIUM, max(score, 40.0)
    return UrgencyLevel.LOW, score


def _determine_affected_departments(item: OrderRiskItem, urgency: UrgencyLevel) -> list[str]:
    """Identify operational departments impacted by the shortage event."""
    departments = ["Fulfilment", "Warehouse Operations", "Procurement"]
    if item.expected_available_on_date == 0 or urgency in {UrgencyLevel.CRITICAL, UrgencyLevel.HIGH}:
        departments.append("Production Planning")
    if item.feed_is_stale:
        departments.append("Inventory Telemetry")
    return departments


def _load_active_proposals_map(db: Session) -> dict[str, tuple[int, str]]:
    """Map shortage_ref -> (proposal_id, proposal_code) for active procurement proposals."""
    try:
        from app.models.procurement import PurchaseProposal
    except ImportError:
        return {}

    rows = db.execute(
        select(
            PurchaseProposal.shortage_ref,
            PurchaseProposal.id,
            PurchaseProposal.proposal_code,
        ).where(PurchaseProposal.status.in_(ACTIVE_PROPOSAL_STATUSES))
    ).all()
    return {row[0]: (row[1], row[2]) for row in rows}


def list_procurement_shortages(
    db: Session,
    *,
    plant_id: int | None = None,
    sku_id: int | None = None,
    include_with_active_proposal: bool = True,
    as_of: datetime | None = None,
) -> list[IntegratedShortageAlert]:
    """Retrieve live shortage alerts from existing risk engine for procurement action."""
    now_utc = normalize_utc(as_of) if as_of else datetime.now(timezone.utc)
    risk_items = assess_backlog_and_risk(
        db,
        plant_id=plant_id,
        sku_id=sku_id,
        only_at_risk=True,
        as_of=now_utc,
    )

    shortage_items = [item for item in risk_items if item.shortage_quantity > 0]
    if not shortage_items:
        return []

    plant_ids = {item.plant_id for item in shortage_items}
    sku_ids = {item.sku_id for item in shortage_items}

    plants_by_id = {
        p.id: p
        for p in db.execute(select(Plant).where(Plant.id.in_(plant_ids))).scalars().all()
    }
    skus_by_id = {
        s.id: s
        for s in db.execute(select(SKU).where(SKU.id.in_(sku_ids))).scalars().all()
    }
    active_proposals = _load_active_proposals_map(db)

    alerts: list[IntegratedShortageAlert] = []
    for item in shortage_items:
        shortage_ref = f"SHORTAGE-ORD-{item.order_id}"
        active_info = active_proposals.get(shortage_ref)
        has_active = active_info is not None
        if not include_with_active_proposal and has_active:
            continue

        plant = plants_by_id.get(item.plant_id)
        sku = skus_by_id.get(item.sku_id)
        urgency, severity_score = _compute_urgency(item, now_utc)

        alerts.append(
            IntegratedShortageAlert(
                shortage_ref=shortage_ref,
                order_id=item.order_id,
                order_number=item.order_number,
                customer_name=item.customer_name,
                plant_id=item.plant_id,
                plant_name=plant.name if plant else f"Plant #{item.plant_id}",
                plant_location=plant.location if plant else "Unknown",
                sku_id=item.sku_id,
                sku_code=sku.sku_code if sku else f"SKU-{item.sku_id}",
                sku_name=sku.name if sku else f"Item #{item.sku_id}",
                unit=sku.unit if sku else "units",
                agreed_delivery_date=item.agreed_delivery_date,
                required_quantity=item.remaining_quantity,
                available_quantity=item.expected_available_on_date,
                shortage_quantity=item.shortage_quantity,
                urgency_level=urgency,
                severity_score=severity_score,
                risk_classification=item.risk_classification,
                feed_is_stale=item.feed_is_stale,
                affected_departments=_determine_affected_departments(item, urgency),
                has_active_proposal=has_active,
                active_proposal_id=active_info[0] if active_info else None,
                active_proposal_code=active_info[1] if active_info else None,
            )
        )

    alerts.sort(key=lambda a: (-a.severity_score, a.agreed_delivery_date, a.order_id))
    return alerts


def get_shortage_by_ref(db: Session, shortage_ref: str) -> IntegratedShortageAlert | None:
    """Look up a single live shortage alert by its shortage_ref."""
    normalized = shortage_ref.strip()
    for alert in list_procurement_shortages(db, include_with_active_proposal=True):
        if alert.shortage_ref == normalized:
            return alert
    return None
