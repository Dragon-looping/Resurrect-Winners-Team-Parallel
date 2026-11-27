"""Routes for godown recovery search, previews, approvals, and alternatives."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.fulfilment.orders import OrderError
from app.fulfilment.recovery.service import (
    get_recovery_plan,
    preview_recovery_swap,
    search_recovery_options,
)
from app.schemas.recovery import (
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
