"""Pydantic schemas for deterministic order plans and transactional approval."""

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import PlanStatus


class OrderPlanCreate(BaseModel):
    """Request payload for POST /orders/{id}/plans."""

    proposed_delivery_date: datetime | None = None
    planned_quantity: int | None = Field(default=None, gt=0)

    @field_validator("proposed_delivery_date")
    @classmethod
    def ensure_utc(cls, value: datetime | None) -> datetime | None:
        """Normalize proposed_delivery_date to UTC."""
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class OrderPlanResponse(BaseModel):
    """Serialized order plan preview or approved record."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    proposed_delivery_date: datetime
    planned_quantity: int
    available_on_date: int
    is_feasible: bool
    stock_version: int
    order_version: int
    plan_details: dict[str, Any]
    status: PlanStatus
    created_at: datetime
    approved_at: datetime | None
