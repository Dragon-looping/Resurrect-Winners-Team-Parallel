"""Routes for godown recovery search, previews, approvals, and alternatives."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.fulfilment.orders import OrderError
from app.fulfilment.recovery.service import (
    approve_recovery_plan,
    get_recovery_alternatives,
    get_recovery_plan,
    preview_recovery_swap,
    search_recovery_options,
)
from app.schemas.recovery import (
    RecoveryAlternativesResponse,
    RecoveryApproveRequest,
    RecoveryAuditLogResponse,
    RecoveryPlanResponse,
    RecoveryPreviewRequest,
    RecoverySearchRequest,
    RecoverySearchResponse,
)

router = APIRouter(tags=["Godown Recovery"])


@router.post(
    "/recovery/search",
    response_model=RecoverySearchResponse,
    summary="Search multi-godown recovery options",
    description="Discovers eligible donor godowns and swaps, validates timelines/costs, and ranks feasible options.",
)
def post_recovery_search(
    payload: RecoverySearchRequest,
    db: Session = Depends(get_db),
) -> RecoverySearchResponse:
    """Search godown recovery options for an order."""
    try:
        return search_recovery_options(db, payload)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc


@router.post(
    "/recovery/swaps/preview",
    response_model=RecoveryPlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Preview a godown recovery plan",
    description="Generates an explainable recovery plan preview without executing stock movements.",
)
def post_recovery_preview(
    payload: RecoveryPreviewRequest,
    db: Session = Depends(get_db),
) -> RecoveryPlanResponse:
    """Generate a recovery plan preview."""
    try:
        plan = preview_recovery_swap(db, payload)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return RecoveryPlanResponse.model_validate(plan)


@router.post(
    "/recovery/swaps/{recovery_id}/approve",
    response_model=RecoveryPlanResponse,
    summary="Approve and execute a recovery plan",
    description="Revalidates versions and feasibility, then atomically commits both orders' allocation changes.",
)
def post_recovery_approve(
    recovery_id: int,
    payload: RecoveryApproveRequest | None = None,
    db: Session = Depends(get_db),
) -> RecoveryPlanResponse:
    """Approve and execute a recovery plan transactionally."""
    actor = payload.actor if payload is not None else "operator"
    try:
        plan = approve_recovery_plan(db, recovery_id, actor=actor)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return RecoveryPlanResponse.model_validate(plan)


@router.get(
    "/recovery/{recovery_id}/alternatives",
    response_model=RecoveryAlternativesResponse,
    summary="Get recovery alternatives and audit history",
    description="Returns alternative godown options (feasible and rejected) and audit trail for a recovery plan.",
)
def get_recovery_alternatives_endpoint(
    recovery_id: int,
    db: Session = Depends(get_db),
) -> RecoveryAlternativesResponse:
    """Fetch alternative recovery options and audit trail for a plan."""
    try:
        plan, alternatives, logs = get_recovery_alternatives(db, recovery_id)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return RecoveryAlternativesResponse(
        recovery_id=plan.id,
        target_order_id=plan.target_order_id,
        alternatives=alternatives,
        audit_logs=[RecoveryAuditLogResponse.model_validate(log) for log in logs],
    )


@router.get(
    "/recovery/{recovery_id}",
    response_model=RecoveryPlanResponse,
    summary="Get recovery plan details",
    description="Returns an explainable recovery plan preview or approved execution record.",
)
def get_recovery_by_id(
    recovery_id: int,
    db: Session = Depends(get_db),
) -> RecoveryPlanResponse:
    """Fetch a recovery plan by ID."""
    try:
        plan = get_recovery_plan(db, recovery_id)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return RecoveryPlanResponse.model_validate(plan)
