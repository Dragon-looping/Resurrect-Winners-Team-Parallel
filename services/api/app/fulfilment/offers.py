"""Customer delivery offer creation and reply handling."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.lifecycle import transition_order_status
from app.fulfilment.orders import OrderError, get_order_by_id
from app.models import CustomerOffer, OfferStatus, OrderStatus
from app.schemas.offer import OfferCreate, OfferReplyRequest


def create_offer(db: Session, order_id: int, payload: OfferCreate) -> CustomerOffer:
    """Create a delivery offer for an order without altering its original CRD."""
    order = get_order_by_id(db, order_id)
    if order.status in {OrderStatus.DISPATCHED.value, OrderStatus.CANCELLED.value}:
        raise OrderError(
            f"Cannot create offer for order in {order.status} state.",
            status_code=409,
        )

    now_utc = datetime.now(timezone.utc)
    offer = CustomerOffer(
        order_id=order.id,
        proposed_delivery_date=payload.proposed_delivery_date,
        offered_quantity=payload.offered_quantity,
        offer_details=dict(payload.offer_details),
        status=OfferStatus.PENDING.value,
        created_at=now_utc,
    )
    db.add(offer)
    transition_order_status(
        db,
        order,
        OrderStatus.OFFER_SENT,
        reason=f"Offer sent for delivery on {payload.proposed_delivery_date.isoformat()}.",
        commit=False,
    )
    db.commit()
    db.refresh(offer)
    return offer


def reply_to_offer(
    db: Session,
    offer_id: int,
    payload: OfferReplyRequest,
) -> CustomerOffer:
    """Process customer acceptance or rejection of an offer while preserving original CRD."""
    offer = db.execute(
        select(CustomerOffer).where(CustomerOffer.id == offer_id)
    ).scalar_one_or_none()
    if offer is None:
        raise OrderError(f"Offer with id={offer_id} not found.", status_code=404)

    if offer.status != OfferStatus.PENDING.value:
        raise OrderError(
            f"Offer id={offer_id} has already been {offer.status.lower()}.",
            status_code=409,
        )

    order = get_order_by_id(db, offer.order_id)
    now_utc = datetime.now(timezone.utc)
    offer.replied_at = now_utc
    offer.customer_reply_note = payload.note

    if payload.accept:
        offer.status = OfferStatus.ACCEPTED.value
        order.agreed_delivery_date = offer.proposed_delivery_date
        transition_order_status(
            db,
            order,
            OrderStatus.CONFIRMED,
            reason=f"Customer accepted offer id={offer.id}; agreed delivery date updated.",
            commit=False,
        )
    else:
        offer.status = OfferStatus.REJECTED.value
        transition_order_status(
            db,
            order,
            OrderStatus.BACKLOGGED,
            reason=f"Customer rejected offer id={offer.id}.",
            commit=False,
        )

    db.commit()
    db.refresh(offer)
    return offer
