"""Pydantic schemas for godown recovery search, previews, approvals, and audit trails."""

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import RecoveryStatus, RecoveryType


class RecoverySearchRequest(BaseModel):
    """Request payload for POST /recovery/search."""

    target_order_id: int = Field(..., gt=0)
    quantity: int | None = Field(default=None, gt=0)
    unit_selling_price: float = Field(default=1000.0, gt=0)
    unit_procurement_cost: float = Field(default=600.0, ge=0)
    wait_penalty_per_unit: float = Field(default=250.0, ge=0)
    margin_floor_pct: float | None = Field(default=None, ge=0, le=100)
    evaluated_at: datetime | None = None

    @field_validator("evaluated_at")
    @classmethod
    def ensure_utc(cls, value: datetime | None) -> datetime | None:
        """Normalize evaluated_at to UTC."""
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class RecoveryOptionItem(BaseModel):
    """Evaluated godown recovery option with feasibility and economic metrics."""

    recovery_type: RecoveryType
    donor_plant_id: int
    donor_plant_name: str
    donor_order_id: int | None
    quantity: int
    is_feasible: bool
    rejection_reasons: list[str]
    wait_cost: float
    recovery_cost: float
    net_benefit: float
    gross_margin_pct: float
    margin_floor_pct: float
    estimated_delivery_at: datetime | None
    explanation: str


class RecoverySearchResponse(BaseModel):
    """Response payload for POST /recovery/search."""

    target_order_id: int
    sku_id: int
    needed_quantity: int
    options: list[RecoveryOptionItem]


class RecoveryPreviewRequest(BaseModel):
    """Request payload for POST /recovery/swaps/preview."""

    target_order_id: int = Field(..., gt=0)
    donor_plant_id: int = Field(..., gt=0)
    donor_order_id: int | None = Field(default=None, gt=0)
    quantity: int | None = Field(default=None, gt=0)
    unit_selling_price: float = Field(default=1000.0, gt=0)
    unit_procurement_cost: float = Field(default=600.0, ge=0)
    wait_penalty_per_unit: float = Field(default=250.0, ge=0)
    margin_floor_pct: float | None = Field(default=None, ge=0, le=100)
    evaluated_at: datetime | None = None

    @field_validator("evaluated_at")
    @classmethod
    def ensure_utc(cls, value: datetime | None) -> datetime | None:
        """Normalize evaluated_at to UTC."""
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class RecoveryPlanResponse(BaseModel):
    """Serialized explainable recovery plan preview or approved execution."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    target_order_id: int
    donor_plant_id: int
    donor_order_id: int | None
    sku_id: int
    quantity: int
    recovery_type: RecoveryType
    status: RecoveryStatus
    is_feasible: bool
    rejection_reasons: list[str]
    wait_cost: float
    recovery_cost: float
    net_benefit: float
    gross_margin_pct: float
    margin_floor_pct: float
    estimated_delivery_at: datetime | None
    target_order_version: int
    donor_order_version: int | None
    target_stock_version: int
    donor_stock_version: int
    explanation: dict[str, Any]
    created_at: datetime
    approved_at: datetime | None


class RecoveryAuditLogResponse(BaseModel):
    """Serialized recovery audit log entry."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    recovery_plan_id: int | None
    action: str
    actor: str
    details: dict[str, Any]
    created_at: datetime


class RecoveryApproveRequest(BaseModel):
    """Optional approval metadata for POST /recovery/swaps/{id}/approve."""

    actor: str = Field(default="operator", min_length=1, max_length=100)
