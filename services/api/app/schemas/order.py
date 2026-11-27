"""Pydantic schemas for customer orders and lifecycle history."""

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import OrderStatus


class OrderCreate(BaseModel):
    """Request payload for creating a customer order."""

    order_number: str = Field(..., min_length=1, max_length=64)
    customer_name: str = Field(..., min_length=1, max_length=150)
    plant_id: int = Field(..., gt=0)
    sku_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)
    requested_delivery_date: datetime = Field(..., description="Original Customer Request Date (CRD).")

    @field_validator("order_number", "customer_name")
    @classmethod
    def strip_non_empty(cls, value: str) -> str:
        """Trim and validate non-empty strings."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty")
        return stripped

    @field_validator("requested_delivery_date")
    @classmethod
    def ensure_utc(cls, value: datetime) -> datetime:
        """Normalize requested_delivery_date to UTC."""
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class OrderStatusHistoryResponse(BaseModel):
    """Serialized order status transition record."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    from_status: str | None
    to_status: str
    reason: str | None
    changed_at: datetime


class OrderResponse(BaseModel):
    """Serialized customer order."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    customer_name: str
    plant_id: int
    sku_id: int
    quantity: int
    allocated_quantity: int
    customer_request_date: datetime
    agreed_delivery_date: datetime
    status: OrderStatus
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedOrdersResponse(BaseModel):
    """Paginated response wrapper for customer orders."""

    total: int
    limit: int
    offset: int
    items: list[OrderResponse]


class OrderStatusTransitionRequest(BaseModel):
    """Request payload for transitioning an order's lifecycle status."""

    to_status: OrderStatus
    reason: str | None = Field(default=None, max_length=500)


class OrderAllocationResponse(BaseModel):
    """Serialized order allocation record."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    plant_id: int
    sku_id: int
    allocated_quantity: int
    reservation_event_id: int | None
    status: str
    created_at: datetime
    updated_at: datetime
