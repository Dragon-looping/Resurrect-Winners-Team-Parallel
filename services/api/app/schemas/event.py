"""Pydantic schemas for inventory event ingestion and responses."""

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import InventoryEventType


class InventoryEventCreate(BaseModel):
    """Request payload for ingesting an inventory domain event."""

    source: str = Field(..., min_length=1, max_length=100, description="Originating system or feed identifier.")
    external_event_id: str = Field(..., min_length=1, max_length=150, description="Unique event ID from source.")
    plant_id: int = Field(..., gt=0, description="Target plant identifier.")
    sku_id: int = Field(..., gt=0, description="Target SKU identifier.")
    event_type: InventoryEventType = Field(..., description="Inventory event classification.")
    quantity: int = Field(..., description="Event quantity (rules depend on event_type).")
    source_sequence: int = Field(..., ge=0, description="Monotonic sequence number within the source.")
    occurred_at: datetime = Field(..., description="Timestamp when the event occurred at source.")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional source event attributes.")

    @field_validator("source", "external_event_id")
    @classmethod
    def strip_non_empty(cls, value: str) -> str:
        """Ensure string identifiers are trimmed and non-empty."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty or whitespace")
        return stripped

    @field_validator("occurred_at")
    @classmethod
    def ensure_utc_datetime(cls, value: datetime) -> datetime:
        """Normalize timestamps to timezone-aware UTC."""
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def validate_quantity_for_event_type(self) -> "InventoryEventCreate":
        """Enforce event-type-specific quantity semantics."""
        positive_only = {
            InventoryEventType.STOCK_RECEIVED,
            InventoryEventType.STOCK_DISPATCHED,
            InventoryEventType.STOCK_RESERVED,
            InventoryEventType.STOCK_RELEASED,
        }
        if self.event_type in positive_only and self.quantity <= 0:
            raise ValueError(f"quantity must be greater than 0 for {self.event_type.value}")
        if self.event_type == InventoryEventType.PHYSICAL_COUNT and self.quantity < 0:
            raise ValueError("quantity must be greater than or equal to 0 for PHYSICAL_COUNT")
        if self.event_type == InventoryEventType.STOCK_ADJUSTED and self.quantity == 0:
            raise ValueError("quantity must be non-zero for STOCK_ADJUSTED")
        return self


class InventoryEventResponse(BaseModel):
    """Serialized representation of a persisted inventory event."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    source: str
    external_event_id: str
    plant_id: int
    sku_id: int
    event_type: InventoryEventType
    quantity: int
    source_sequence: int
    occurred_at: datetime
    received_at: datetime
    metadata: dict[str, Any] = Field(validation_alias="metadata_json")


class EventIngestionResponse(BaseModel):
    """Response returned after processing POST /events."""

    status: str = Field(..., description="Ingestion outcome: accepted or duplicate.")
    idempotent: bool = Field(default=False, description="True if event was already processed previously.")
    message: str
    event: InventoryEventResponse


class QuarantinedEventResponse(BaseModel):
    """Serialized representation of a quarantined invalid event."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str | None
    external_event_id: str | None
    raw_payload: dict[str, Any]
    failure_reason: str
    error_details: list[dict[str, Any]] | dict[str, Any] | None
    received_at: datetime


class PaginatedQuarantinedEventsResponse(BaseModel):
    """Paginated response wrapper for quarantined events."""

    total: int
    limit: int
    offset: int
    items: list[QuarantinedEventResponse]
