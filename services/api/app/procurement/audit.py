"""Immutable audit logging for SETUVYUHA Procurement & Briefings."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.procurement import ProcurementAuditLog


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
