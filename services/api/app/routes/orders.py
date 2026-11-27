"""Routes for customer order creation and retrieval."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.fulfilment.orders import OrderError, create_order, get_order_by_id, list_orders
from app.inventory.ingestion import EventValidationError
from app.models.enums import OrderStatus
from app.schemas.order import OrderCreate, OrderResponse, PaginatedOrdersResponse

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
