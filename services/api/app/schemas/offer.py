"""Pydantic schemas for customer delivery offers and replies."""

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import OfferStatus


class OfferCreate(BaseModel):
    """Request payload for POST /orders/{id}/offers."""

    proposed_delivery_date: datetime
    offered_quantity: int = Field(..., gt=0)
    offer_details: dict[str, Any] = Field(default_factory=dict)

    @field_validator("proposed_delivery_date")
    @classmethod
    def ensure_utc(cls, value: datetime) -> datetime:
        """Normalize proposed_delivery_date to UTC."""
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class OfferReplyRequest(BaseModel):
    """Request payload for POST /offers/{id}/reply."""

    accept: bool
    note: str | None = Field(default=None, max_length=500)


class OfferResponse(BaseModel):
    """Serialized customer delivery offer."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    proposed_delivery_date: datetime
    offered_quantity: int
    offer_details: dict[str, Any]
    status: OfferStatus
    customer_reply_note: str | None
    created_at: datetime
    replied_at: datetime | None
