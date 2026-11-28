"""Routes for customer delivery offers and replies."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.fulfilment.offers import create_offer, reply_to_offer
from app.fulfilment.orders import OrderError, get_order_by_id
from app.schemas.offer import OfferCreate, OfferReplyRequest, OfferResponse

router = APIRouter(tags=["Customer Offers"])


@router.post(
    "/orders/{order_id}/offers",
    response_model=OfferResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a customer delivery offer",
    description="Proposes a new delivery date/quantity for an order while preserving original CRD.",
)
def post_order_offer(
    order_id: int,
    payload: OfferCreate,
    db: Session = Depends(get_db),
) -> OfferResponse:
    """Create a customer delivery offer."""
    try:
        offer = create_offer(db, order_id, payload)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return OfferResponse.model_validate(offer)


@router.get(
    "/orders/{order_id}/offers",
    response_model=list[OfferResponse],
    summary="Get customer delivery offers for an order",
    description="Returns all customer delivery offers for a given order ID.",
)
def get_order_offers(
    order_id: int,
    db: Session = Depends(get_db),
) -> list[OfferResponse]:
    """Retrieve all delivery offers for an order."""
    try:
        order = get_order_by_id(db, order_id)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return [OfferResponse.model_validate(offer) for offer in order.offers]


@router.post(
    "/offers/{offer_id}/reply",
    response_model=OfferResponse,
    summary="Reply to a customer offer",
    description="Accepts or rejects a pending customer delivery offer.",
)
def post_offer_reply(
    offer_id: int,
    payload: OfferReplyRequest,
    db: Session = Depends(get_db),
) -> OfferResponse:
    """Record customer reply to an offer."""
    try:
        offer = reply_to_offer(db, offer_id, payload)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return OfferResponse.model_validate(offer)
