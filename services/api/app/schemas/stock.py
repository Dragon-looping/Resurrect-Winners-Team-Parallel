"""Pydantic schemas for stock read endpoints."""

from datetime import datetime

from pydantic import BaseModel


class StockItemResponse(BaseModel):
    """Stock projection for a single plant and SKU."""

    plant_id: int
    plant_name: str
    sku_id: int
    sku_code: str
    sku_name: str
    unit: str
    physical_stock: int
    reserved_stock: int
    confirmed_arrivals: int
    available_stock: int
    last_event_id: int | None = None
    updated_at: datetime | None = None


class StockListResponse(BaseModel):
    """Response wrapper for stock listing endpoints."""

    count: int
    items: list[StockItemResponse]
