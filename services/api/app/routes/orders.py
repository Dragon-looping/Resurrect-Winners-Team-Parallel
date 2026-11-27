"""Routes for customer order creation and retrieval."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.fulfilment.allocation import allocate_orders
from app.fulfilment.lifecycle import get_order_history, transition_order_status
from app.fulfilment.orders import OrderError, create_order, get_order_by_id, list_orders
from app.inventory.ingestion import EventValidationError
from app.models.enums import OrderStatus
from app.schemas.order import (
    OrderCreate,
    OrderResponse,
    OrderStatusHistoryResponse,
    OrderStatusTransitionRequest,
    PaginatedOrdersResponse,
)

router = APIRouter(tags=["Orders"])


@router.post(
    "/orders",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a customer order",
    description="Creates a customer order and preserves the original Customer Request Date (CRD).",
)
def create_customer_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
) -> OrderResponse:
    """Create a new customer order."""
    try:
        order = create_order(db, payload)
    except (OrderError, EventValidationError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return OrderResponse.model_validate(order)


@router.get(
    "/orders",
    response_model=PaginatedOrdersResponse,
    summary="List customer orders",
    description="Returns customer orders ordered by delivery priority with pagination and filters.",
)
def get_customer_orders(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    plant_id: int | None = Query(default=None, gt=0),
    sku_id: int | None = Query(default=None, gt=0),
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> PaginatedOrdersResponse:
    """List customer orders."""
    items, total = list_orders(
        db,
        limit=limit,
        offset=offset,
        plant_id=plant_id,
        sku_id=sku_id,
        status=status_filter,
    )
    return PaginatedOrdersResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[OrderResponse.model_validate(item) for item in items],
    )


@router.get(
    "/orders/{order_id}",
    response_model=OrderResponse,
    summary="Get a customer order",
    description="Returns a single customer order by ID.",
)
def get_customer_order(
    order_id: int,
    db: Session = Depends(get_db),
) -> OrderResponse:
    """Fetch a single customer order."""
    try:
        order = get_order_by_id(db, order_id)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return OrderResponse.model_validate(order)


@router.get(
    "/orders/{order_id}/history",
    response_model=list[OrderStatusHistoryResponse],
    summary="Get order status history",
    description="Returns the chronological lifecycle transition history for an order.",
)
def get_customer_order_history(
    order_id: int,
    db: Session = Depends(get_db),
) -> list[OrderStatusHistoryResponse]:
    """Fetch status history for an order."""
    try:
        get_order_by_id(db, order_id)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    history = get_order_history(db, order_id)
    return [OrderStatusHistoryResponse.model_validate(h) for h in history]


@router.post(
    "/orders/{order_id}/status",
    response_model=OrderResponse,
    summary="Transition order status",
    description="Applies a validated lifecycle status transition and records audit history.",
)
def transition_customer_order_status(
    order_id: int,
    payload: OrderStatusTransitionRequest,
    db: Session = Depends(get_db),
) -> OrderResponse:
    """Transition an order's lifecycle status."""
    try:
        order = get_order_by_id(db, order_id)
        updated = transition_order_status(db, order, payload.to_status, reason=payload.reason)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return OrderResponse.model_validate(updated)


@router.post(
    "/orders/allocate",
    response_model=list[OrderResponse],
    summary="Allocate inventory to orders",
    description="Allocates available stock to eligible orders by earliest agreed delivery date, creation time, and ID.",
)
def run_order_allocation(
    plant_id: int | None = Query(default=None, gt=0),
    sku_id: int | None = Query(default=None, gt=0),
    order_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
) -> list[OrderResponse]:
    """Run deterministic priority-based inventory allocation."""
    updated = allocate_orders(db, plant_id=plant_id, sku_id=sku_id, order_id=order_id)
    return [OrderResponse.model_validate(o) for o in updated]
