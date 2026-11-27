"""Audit logging helper for warehouse authentication and inter-warehouse actions."""

from typing import Any

from sqlalchemy.orm import Session

from app.models import WarehouseAuditLog


def record_warehouse_audit(
    db: Session,
    *,
    actor_user_id: int | None,
    actor_login_id: str,
    plant_id: int | None,
    action: str,
    target_type: str,
    target_id: str,
    details: dict[str, Any] | None = None,
) -> WarehouseAuditLog:
    """Append an immutable warehouse audit log entry to the current transaction."""
    entry = WarehouseAuditLog(
        actor_user_id=actor_user_id,
        actor_login_id=actor_login_id,
        plant_id=plant_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details_json=details or {},
    )
    db.add(entry)
    return entry
