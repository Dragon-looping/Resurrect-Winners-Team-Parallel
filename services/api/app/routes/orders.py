"""Routes for customer order creation and retrieval."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import assert_plant_access, get_scoped_warehouse_user
from app.core.database import get_db
from app.fulfilment.allocation import allocate_orders, release_order_allocations
from app.fulfilment.lifecycle import get_order_history, transition_order_status
from app.fulfilment.orders import OrderError, create_order, get_order_by_id, list_orders
from app.fulfilment.risk import OrderRiskItem, assess_backlog_and_risk
from app.inventory.ingestion import EventValidationError
from app.models import OrderAllocation, WarehouseUser
from app.models.enums import OrderStatus
from app.schemas.order import (
    OrderAllocationResponse,
    OrderCreate,
    OrderResponse,
    OrderStatusHistoryResponse,
    OrderStatusTransitionRequest,
    PaginatedOrdersResponse,
)
from sqlalchemy import select

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
    scoped_user: WarehouseUser | None = Depends(get_scoped_warehouse_user),
    db: Session = Depends(get_db),
) -> OrderResponse:
    """Create a new customer order."""
    assert_plant_access(scoped_user, payload.plant_id)
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
    scoped_user: WarehouseUser | None = Depends(get_scoped_warehouse_user),
    db: Session = Depends(get_db),
) -> PaginatedOrdersResponse:
    """List customer orders."""
    effective_plant_id = assert_plant_access(scoped_user, plant_id)
    items, total = list_orders(
        db,
        limit=limit,
        offset=offset,
        plant_id=effective_plant_id,
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
    "/orders/backlog",
    response_model=list[OrderRiskItem],
    summary="List order backlog",
    description="Returns unfulfilled orders with shortages, allocated quantities, and expected availability.",
)
def get_order_backlog(
    plant_id: int | None = Query(default=None, gt=0),
    sku_id: int | None = Query(default=None, gt=0),
    scoped_user: WarehouseUser | None = Depends(get_scoped_warehouse_user),
    db: Session = Depends(get_db),
) -> list[OrderRiskItem]:
    """Return unfulfilled order backlog."""
    effective_plant_id = assert_plant_access(scoped_user, plant_id)
    return assess_backlog_and_risk(db, plant_id=effective_plant_id, sku_id=sku_id, only_at_risk=False)


@router.get(
    "/orders/risk",
    response_model=list[OrderRiskItem],
    summary="List orders at delivery risk",
    description="Returns orders at risk of missing their agreed delivery date, distinguishing stale feeds from shortages.",
)
def get_order_delivery_risk(
    plant_id: int | None = Query(default=None, gt=0),
    sku_id: int | None = Query(default=None, gt=0),
    scoped_user: WarehouseUser | None = Depends(get_scoped_warehouse_user),
    db: Session = Depends(get_db),
) -> list[OrderRiskItem]:
    """Return orders at delivery risk."""
    effective_plant_id = assert_plant_access(scoped_user, plant_id)
    return assess_backlog_and_risk(db, plant_id=effective_plant_id, sku_id=sku_id, only_at_risk=True)


@router.get(
    "/orders/{order_id}",
    response_model=OrderResponse,
    summary="Get a customer order",
    description="Returns a single customer order by ID.",
)
def get_customer_order(
    order_id: int,
    scoped_user: WarehouseUser | None = Depends(get_scoped_warehouse_user),
    db: Session = Depends(get_db),
) -> OrderResponse:
    """Fetch a single customer order."""
    try:
        order = get_order_by_id(db, order_id)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    assert_plant_access(scoped_user, order.plant_id)
    return OrderResponse.model_validate(order)


@router.get(
    "/orders/{order_id}/history",
    response_model=list[OrderStatusHistoryResponse],
    summary="Get order status history",
    description="Returns the chronological lifecycle transition history for an order.",
)
def get_customer_order_history(
    order_id: int,
    scoped_user: WarehouseUser | None = Depends(get_scoped_warehouse_user),
    db: Session = Depends(get_db),
) -> list[OrderStatusHistoryResponse]:
    """Fetch status history for an order."""
    try:
        order = get_order_by_id(db, order_id)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    assert_plant_access(scoped_user, order.plant_id)
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


@router.post(
    "/orders/{order_id}/release",
    response_model=OrderResponse,
    summary="Release order allocations",
    description="Releases active inventory reservations for an order back to available stock.",
)
def release_customer_order_allocations(
    order_id: int,
    db: Session = Depends(get_db),
) -> OrderResponse:
    """Release active allocations for an order."""
    try:
        order = get_order_by_id(db, order_id)
        updated = release_order_allocations(db, order)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return OrderResponse.model_validate(updated)


@router.get(
    "/orders/{order_id}/allocations",
    response_model=list[OrderAllocationResponse],
    summary="List order allocations",
    description="Returns inventory allocation records for an order.",
)
def get_customer_order_allocations(
    order_id: int,
    db: Session = Depends(get_db),
) -> list[OrderAllocationResponse]:
    """List allocations for an order."""
    try:
        get_order_by_id(db, order_id)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    allocs = db.execute(
        select(OrderAllocation)
        .where(OrderAllocation.order_id == order_id)
        .order_by(OrderAllocation.id.asc())
    ).scalars().all()
    return [OrderAllocationResponse.model_validate(a) for a in allocs]
