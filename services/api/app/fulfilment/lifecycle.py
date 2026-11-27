"""Order lifecycle state machine and status history recording."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.orders import OrderError
from app.models import CustomerOrder, OrderStatus, OrderStatusHistory

ALLOWED_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.CREATED: {
        OrderStatus.ALLOCATED,
        OrderStatus.PARTIALLY_ALLOCATED,
        OrderStatus.BACKLOGGED,
        OrderStatus.OFFER_SENT,
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.PARTIALLY_ALLOCATED: {
        OrderStatus.ALLOCATED,
        OrderStatus.BACKLOGGED,
        OrderStatus.OFFER_SENT,
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.BACKLOGGED: {
        OrderStatus.PARTIALLY_ALLOCATED,
        OrderStatus.ALLOCATED,
        OrderStatus.OFFER_SENT,
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.OFFER_SENT: {
        OrderStatus.CONFIRMED,
        OrderStatus.BACKLOGGED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.ALLOCATED: {
        OrderStatus.CONFIRMED,
        OrderStatus.PARTIALLY_ALLOCATED,
        OrderStatus.READY_FOR_DISPATCH,
        OrderStatus.BACKLOGGED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.CONFIRMED: {
        OrderStatus.ALLOCATED,
        OrderStatus.PARTIALLY_ALLOCATED,
        OrderStatus.READY_FOR_DISPATCH,
        OrderStatus.CANCELLED,
    },
    OrderStatus.READY_FOR_DISPATCH: {
        OrderStatus.DISPATCHED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.DISPATCHED: set(),
    OrderStatus.CANCELLED: set(),
}


def transition_order_status(
    db: Session,
    order: CustomerOrder,
    to_status: OrderStatus,
    *,
    reason: str | None = None,
    commit: bool = True,
) -> CustomerOrder:
    """Validate and apply an order status transition, recording audit history."""
    current = OrderStatus(order.status)
    if current == to_status:
        return order

    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if to_status not in allowed:
        raise OrderError(
            f"Invalid order status transition from {current.value} to {to_status.value}.",
            status_code=409,
        )

    now_utc = datetime.now(timezone.utc)
    order.status = to_status.value
    order.version += 1
    order.updated_at = now_utc
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=current.value,
            to_status=to_status.value,
            reason=reason,
            changed_at=now_utc,
        )
    )

    if commit:
        db.commit()
        db.refresh(order)
    else:
        db.flush()
    return order


def get_order_history(db: Session, order_id: int) -> list[OrderStatusHistory]:
    """Return chronological status history for an order."""
    return list(
        db.execute(
            select(OrderStatusHistory)
            .where(OrderStatusHistory.order_id == order_id)
            .order_by(OrderStatusHistory.changed_at.asc(), OrderStatusHistory.id.asc())
        )
        .scalars()
        .all()
    )
