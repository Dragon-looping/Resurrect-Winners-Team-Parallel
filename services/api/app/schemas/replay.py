"""Pydantic schemas for deterministic inventory replay."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReplayBalanceItem(BaseModel):
    """Summary of a single (plant_id, sku_id) balance after replay."""

    model_config = ConfigDict(from_attributes=True)

    plant_id: int
    sku_id: int
    physical_stock: int
    reserved_stock: int
    confirmed_arrivals: int
    available_stock: int
    last_event_id: int | None


class ReplayResponse(BaseModel):
    """Response returned by POST /inventory/replay."""

    status: str = "replayed"
    events_replayed: int
    balances_updated: int
    plant_id: int | None = None
    sku_id: int | None = None
    replayed_at: datetime
    balances: list[ReplayBalanceItem]
