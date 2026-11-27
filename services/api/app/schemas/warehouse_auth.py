"""Pydantic schemas for warehouse authentication and inter-warehouse stock requests."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import InterWarehouseRequestStatus, WarehouseUserRole


class LoginRequest(BaseModel):
    """Credentials payload for warehouse operator login."""

    login_id: str | None = Field(default=None, max_length=80)
    email: str | None = Field(default=None, max_length=120)
    password: str = Field(min_length=1, max_length=200)


class WarehouseUserProfile(BaseModel):
    """Authenticated warehouse operator identity and assigned plant."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    login_id: str
    display_name: str
    role: WarehouseUserRole
    plant_id: int
    plant_name: str
    plant_location: str
    is_active: bool


class LoginResponse(BaseModel):
    """Bearer token and warehouse profile returned after login."""

    access_token: str
    token_type: str = "bearer"
    user: WarehouseUserProfile


class NetworkStockAvailabilityItem(BaseModel):
    """Read-only limited stock availability at another warehouse."""

    plant_id: int
    plant_name: str
    plant_location: str
    sku_id: int
    sku_code: str
    sku_name: str
    unit: str
    available_stock: int
    availability_status: Literal["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"]
    updated_at: datetime | None = None


class NetworkStockAvailabilityResponse(BaseModel):
    """Response wrapper for inter-warehouse read-only stock availability."""

    count: int
    items: list[NetworkStockAvailabilityItem]


class StockRequestCreate(BaseModel):
    """Payload for requesting stock from another warehouse."""

    requesting_plant_id: int | None = Field(default=None, gt=0)
    supplying_plant_id: int = Field(gt=0)
    sku_id: int = Field(gt=0)
    requested_qty: int = Field(gt=0)
    reason: str | None = Field(default=None, max_length=500)
    idempotency_key: str | None = Field(default=None, max_length=120)


class StockRequestApprove(BaseModel):
    """Payload for approving (fully or partially) an incoming stock request."""

    approved_qty: int = Field(gt=0)


class StockRequestReject(BaseModel):
    """Payload for rejecting an incoming stock request."""

    rejection_reason: str = Field(min_length=2, max_length=500)


class StockRequestDispatch(BaseModel):
    """Optional quantity override for dispatching an approved stock request."""

    dispatched_qty: int | None = Field(default=None, gt=0)


class StockRequestReceive(BaseModel):
    """Optional received quantity for confirming receipt of a dispatched request."""

    received_qty: int | None = Field(default=None, gt=0)


class StockRequestResponse(BaseModel):
    """Serialized inter-warehouse stock request."""

    id: int
    request_code: str
    requesting_plant_id: int
    requesting_plant_name: str
    supplying_plant_id: int
    supplying_plant_name: str
    sku_id: int
    sku_code: str
    sku_name: str
    unit: str
    requested_qty: int
    approved_qty: int | None = None
    dispatched_qty: int
    received_qty: int
    status: InterWarehouseRequestStatus
    reason: str | None = None
    rejection_reason: str | None = None
    dispatch_event_id: int | None = None
    receipt_event_id: int | None = None
    created_at: datetime
    updated_at: datetime


class StockRequestListResponse(BaseModel):
    """Paginated/filtered list of inter-warehouse requests visible to the user."""

    count: int
    items: list[StockRequestResponse]
