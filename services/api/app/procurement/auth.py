"""Role-based authorization and human-in-the-loop enforcement for Procurement."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Header, HTTPException, status

from app.models.enums import ProcurementRole

HUMAN_APPROVER_ROLES: frozenset[ProcurementRole] = frozenset(
    {
        ProcurementRole.PROCUREMENT_OFFICER,
        ProcurementRole.ADMINISTRATOR,
    }
)

OPERATIONAL_ROLES: frozenset[ProcurementRole] = frozenset(
    {
        ProcurementRole.WAREHOUSE_MANAGER,
        ProcurementRole.PROCUREMENT_OFFICER,
        ProcurementRole.ADMINISTRATOR,
        ProcurementRole.PLANNER,
    }
)

BRIEFING_ROLES: frozenset[ProcurementRole] = frozenset(
    {
        ProcurementRole.WAREHOUSE_MANAGER,
        ProcurementRole.PROCUREMENT_OFFICER,
        ProcurementRole.ADMINISTRATOR,
    }
)


@dataclass(frozen=True)
class ActorContext:
    """Authenticated caller identity and role for procurement operations."""

    actor_id: str
    role: ProcurementRole

    @property
    def is_human_approver(self) -> bool:
        return (
            self.role in HUMAN_APPROVER_ROLES
            and self.actor_id.strip().lower() not in {"", "ai", "ai_system", "system", "bot"}
        )


def parse_actor_role(raw_role: str | None) -> ProcurementRole:
    """Parse and validate a procurement role string."""
    if not raw_role or not raw_role.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing actor role. Provide X-Actor-Role header.",
        )
    normalized = raw_role.strip().upper()
    try:
        return ProcurementRole(normalized)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Unsupported actor role '{raw_role}'.",
        ) from exc


def get_actor_context(
    x_actor_id: str | None = Header(default=None, alias="X-Actor-Id"),
    x_actor_role: str | None = Header(default=None, alias="X-Actor-Role"),
) -> ActorContext:
    """FastAPI dependency extracting and validating caller identity and role."""
    if not x_actor_id or not x_actor_id.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing actor identity. Provide X-Actor-Id header.",
        )
    role = parse_actor_role(x_actor_role)
    return ActorContext(actor_id=x_actor_id.strip(), role=role)


def require_human_approver(actor: ActorContext) -> ActorContext:
    """Enforce that only authorized human users (never AI) may approve/reject/order/send."""
    if actor.role == ProcurementRole.AI_SYSTEM or actor.actor_id.strip().lower() in {
        "ai",
        "ai_system",
        "system",
        "bot",
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI systems are strictly prohibited from approving purchases, creating POs, or sending supplier emails.",
        )
    if actor.role not in HUMAN_APPROVER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Role '{actor.role.value}' is not authorized for procurement approval actions. "
                "Requires PROCUREMENT_OFFICER or ADMINISTRATOR."
            ),
        )
    return actor


def require_briefing_access(actor: ActorContext, target_role: ProcurementRole) -> None:
    """Enforce role-based permissions for AI operational briefings."""
    if target_role not in BRIEFING_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Briefings are only supported for WAREHOUSE_MANAGER, PROCUREMENT_OFFICER, and ADMINISTRATOR.",
        )
    if actor.role == ProcurementRole.ADMINISTRATOR:
        return
    if actor.role != target_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{actor.role.value}' is not permitted to access '{target_role.value}' briefings.",
        )
