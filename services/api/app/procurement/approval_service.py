"""Human-only approval and rejection workflow for purchase proposals."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import ProposalStatus
from app.models.procurement import PurchaseProposal
from app.procurement.audit import record_audit_log
from app.procurement.auth import ActorContext, require_human_approver
from app.procurement.proposal_service import _to_proposal_response
from app.procurement.schemas import PurchaseProposalResponse


def list_approval_queue(db: Session) -> list[PurchaseProposalResponse]:
    """Return all proposals awaiting human approval, ordered by urgency/creation."""
    proposals = list(
        db.execute(
            select(PurchaseProposal)
            .where(PurchaseProposal.status == ProposalStatus.PENDING_APPROVAL.value)
            .order_by(PurchaseProposal.created_at.asc(), PurchaseProposal.id.asc())
        )
        .scalars()
        .all()
    )
    return [_to_proposal_response(db, p) for p in proposals]


def approve_proposal(
    db: Session,
    proposal_id: int,
    *,
    expected_version: int,
    actor: ActorContext,
    approval_notes: str | None = None,
) -> PurchaseProposalResponse:
    """Approve a PENDING_APPROVAL proposal. Strictly requires an authorized human user."""
    require_human_approver(actor)

    proposal = db.execute(
        select(PurchaseProposal).where(PurchaseProposal.id == proposal_id)
    ).scalar_one_or_none()
    if proposal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase proposal {proposal_id} not found.",
        )

    if proposal.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Concurrent modification detected on {proposal.proposal_code}: "
                f"expected version {expected_version}, current version {proposal.version}."
            ),
        )

    if proposal.status != ProposalStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Proposal {proposal.proposal_code} cannot be approved in status '{proposal.status}'. "
                "Must be PENDING_APPROVAL."
            ),
        )

    now_utc = datetime.now(timezone.utc)
    proposal.status = ProposalStatus.APPROVED.value
    proposal.version += 1
    proposal.approved_by = actor.actor_id
    proposal.approved_at = now_utc

    record_audit_log(
        db,
        entity_type="PROPOSAL",
        entity_id=proposal.proposal_code,
        action="PROPOSAL_APPROVED",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={
            "approval_notes": approval_notes or "",
            "approved_at": now_utc.isoformat(),
            "estimated_total_price": proposal.estimated_total_price,
            "new_version": proposal.version,
        },
    )
    db.commit()
    db.refresh(proposal)
    return _to_proposal_response(db, proposal)


def reject_proposal(
    db: Session,
    proposal_id: int,
    *,
    expected_version: int,
    actor: ActorContext,
    reason: str,
) -> PurchaseProposalResponse:
    """Reject a PENDING_APPROVAL proposal with a mandatory human-provided reason."""
    require_human_approver(actor)

    cleaned_reason = reason.strip()
    if len(cleaned_reason) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A mandatory rejection reason (at least 3 characters) is required.",
        )

    proposal = db.execute(
        select(PurchaseProposal).where(PurchaseProposal.id == proposal_id)
    ).scalar_one_or_none()
    if proposal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase proposal {proposal_id} not found.",
        )

    if proposal.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Concurrent modification detected on {proposal.proposal_code}: "
                f"expected version {expected_version}, current version {proposal.version}."
            ),
        )

    if proposal.status != ProposalStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Proposal {proposal.proposal_code} cannot be rejected in status '{proposal.status}'.",
        )

    now_utc = datetime.now(timezone.utc)
    proposal.status = ProposalStatus.REJECTED.value
    proposal.version += 1
    proposal.rejected_by = actor.actor_id
    proposal.rejected_at = now_utc
    proposal.rejection_reason = cleaned_reason

    record_audit_log(
        db,
        entity_type="PROPOSAL",
        entity_id=proposal.proposal_code,
        action="PROPOSAL_REJECTED",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={
            "rejection_reason": cleaned_reason,
            "rejected_at": now_utc.isoformat(),
            "new_version": proposal.version,
        },
    )
    db.commit()
    db.refresh(proposal)
    return _to_proposal_response(db, proposal)
