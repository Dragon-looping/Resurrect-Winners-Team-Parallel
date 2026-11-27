"""Routes for deterministic order plan previews and transactional approvals."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.fulfilment.orders import OrderError
from app.fulfilment.plans import approve_order_plan, generate_order_plan
from app.schemas.plan import OrderPlanCreate, OrderPlanResponse

router = APIRouter(tags=["Order Plans"])


@router.post(
    "/orders/{order_id}/plans",
    response_model=OrderPlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate an order plan preview",
    description="Calculates deterministic availability and feasibility for an order on a proposed date.",
)
def post_order_plan(
    order_id: int,
    payload: OrderPlanCreate,
    db: Session = Depends(get_db),
) -> OrderPlanResponse:
    """Generate a deterministic order plan preview."""
    try:
        plan = generate_order_plan(db, order_id, payload)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return OrderPlanResponse.model_validate(plan)


@router.post(
    "/plans/{plan_id}/approve",
    response_model=OrderPlanResponse,
    summary="Approve an order plan",
    description="Revalidates stock/order versions and feasibility, then commits the plan transactionally.",
)
def post_approve_plan(
    plan_id: int,
    db: Session = Depends(get_db),
) -> OrderPlanResponse:
    """Approve an order plan transactionally."""
    try:
        plan = approve_order_plan(db, plan_id)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return OrderPlanResponse.model_validate(plan)
