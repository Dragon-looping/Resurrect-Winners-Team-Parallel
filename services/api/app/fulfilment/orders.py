"""Customer order creation and retrieval service."""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.inventory.ingestion import ensure_plant_and_sku_exist
from app.models import CustomerOrder, OrderStatus, OrderStatusHistory
from app.schemas.order import OrderCreate


class OrderError(Exception):
    """Base domain error for order lifecycle operations."""

    def __init__(self, reason: str, status_code: int = 422) -> None:
        super().__init__(reason)
        self.reason = reason
        self.status_code = status_code


def create_order(db: Session, payload: OrderCreate) -> CustomerOrder:
    """Create a new customer order with permanent CRD and initial status history."""
    ensure_plant_and_sku_exist(db, payload.plant_id, payload.sku_id)

    now_utc = datetime.now(timezone.utc)
    order = CustomerOrder(
        order_number=payload.order_number,
        customer_name=payload.customer_name,
        plant_id=payload.plant_id,
        sku_id=payload.sku_id,
        quantity=payload.quantity,
        allocated_quantity=0,
        customer_request_date=payload.requested_delivery_date,
        agreed_delivery_date=payload.requested_delivery_date,
        status=OrderStatus.CREATED.value,
        version=1,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(order)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise OrderError(
            f"Order with order_number='{payload.order_number}' already exists.",
            status_code=409,
        ) from exc

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=None,
            to_status=OrderStatus.CREATED.value,
            reason="Order created",
            changed_at=now_utc,
        )
    )
    db.commit()
    db.refresh(order)
    return order


def get_order_by_id(db: Session, order_id: int) -> CustomerOrder:
    """Fetch a customer order by ID or raise OrderError(404)."""
    order = db.execute(
        select(CustomerOrder).where(CustomerOrder.id == order_id)
    ).scalar_one_or_none()
    if order is None:
        raise OrderError(f"Order with id={order_id} not found.", status_code=404)
    return order


def list_orders(
    db: Session,
    *,
    limit: int = 50,
    offset: int = 0,
    plant_id: int | None = None,
    sku_id: int | None = None,
    status: OrderStatus | None = None,
) -> tuple[list[CustomerOrder], int]:
    """List customer orders with pagination and optional filters."""
    filters = []
    if plant_id is not None:
        filters.append(CustomerOrder.plant_id == plant_id)
    if sku_id is not None:
        filters.append(CustomerOrder.sku_id == sku_id)
    if status is not None:
        filters.append(CustomerOrder.status == status.value)

    total = db.execute(select(func.count()).select_from(CustomerOrder).where(*filters)).scalar_one()
    items = (
        db.execute(
            select(CustomerOrder)
            .where(*filters)
            .order_by(CustomerOrder.agreed_delivery_date.asc(), CustomerOrder.created_at.asc(), CustomerOrder.id.asc())
            .offset(offset)
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return list(items), total
