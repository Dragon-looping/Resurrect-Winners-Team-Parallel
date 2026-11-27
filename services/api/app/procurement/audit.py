"""Immutable audit logging for SETUVYUHA Procurement & Briefings."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.procurement import ProcurementAuditLog, PurchaseProposal
from app.procurement.schemas import AuditLogResponse


def record_audit_log(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    action: str,
    actor_id: str,
    actor_role: str,
    details: dict[str, Any] | None = None,
) -> ProcurementAuditLog:
    """Append an immutable audit trail record inside the current transaction."""
    entry = ProcurementAuditLog(
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
        actor_id=actor_id,
        actor_role=actor_role,
        details=details or {},
    )
    db.add(entry)
    db.flush()
    return entry


def list_audit_logs(
    db: Session,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    limit: int = 100,
) -> list[ProcurementAuditLog]:
    """Retrieve procurement audit logs ordered newest-first."""
    stmt = select(ProcurementAuditLog)
    if entity_type is not None:
        stmt = stmt.where(ProcurementAuditLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(ProcurementAuditLog.entity_id == str(entity_id))
    stmt = stmt.order_by(ProcurementAuditLog.created_at.desc(), ProcurementAuditLog.id.desc()).limit(limit)
    return list(db.execute(stmt).scalars().all())


def get_audit_trail_responses(
    db: Session,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    limit: int = 100,
) -> list[AuditLogResponse]:
    """Return serialized audit log entries for API responses."""
    rows = list_audit_logs(db, entity_type=entity_type, entity_id=entity_id, limit=limit)
    return [
        AuditLogResponse(
            id=row.id,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            action=row.action,
            actor_id=row.actor_id,
            actor_role=row.actor_role,
            details=row.details,
            created_at=row.created_at,
        )
        for row in rows
    ]


def get_proposal_approval_history(db: Session, proposal_id: int) -> list[AuditLogResponse]:
    """Return chronological audit and approval history for a specific purchase proposal."""
    proposal = db.execute(
        select(PurchaseProposal).where(PurchaseProposal.id == proposal_id)
    ).scalar_one_or_none()
    if proposal is None:
        return []
    rows = list(
        db.execute(
            select(ProcurementAuditLog)
            .where(
                ProcurementAuditLog.entity_type == "PROPOSAL",
                ProcurementAuditLog.entity_id == proposal.proposal_code,
            )
            .order_by(ProcurementAuditLog.created_at.asc(), ProcurementAuditLog.id.asc())
        )
        .scalars()
        .all()
    )
    return [
        AuditLogResponse(
            id=row.id,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            action=row.action,
            actor_id=row.actor_id,
            actor_role=row.actor_role,
            details=row.details,
            created_at=row.created_at,
        )
        for row in rows
    ]
