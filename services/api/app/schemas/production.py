"""Pydantic schemas for production batch readiness."""

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import ProductionBatchStatus


class ComponentRequirement(BaseModel):
    """Required component SKU and quantity for a production batch."""

    sku_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)


class ProductionBatchCreate(BaseModel):
    """Request payload for creating a production batch."""

    batch_code: str = Field(..., min_length=1, max_length=64)
    plant_id: int = Field(..., gt=0)
    sku_id: int = Field(..., gt=0)
    planned_quantity: int = Field(..., gt=0)
    expected_completion_at: datetime
    required_components: list[ComponentRequirement] = Field(default_factory=list)
    reserve_components: bool = True

    @field_validator("batch_code")
    @classmethod
    def strip_code(cls, value: str) -> str:
        """Trim and validate non-empty batch code."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("batch_code must not be empty")
        return stripped

    @field_validator("expected_completion_at")
    @classmethod
    def ensure_utc(cls, value: datetime) -> datetime:
        """Normalize expected_completion_at to UTC."""
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class ProductionBatchResponse(BaseModel):
    """Serialized production batch."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_code: str
    plant_id: int
    sku_id: int
    planned_quantity: int
    completed_quantity: int
    expected_completion_at: datetime
    status: ProductionBatchStatus
    required_components: list[ComponentRequirement]
    components_reserved: bool
    output_counted_in_inventory: bool
    created_at: datetime
    updated_at: datetime
