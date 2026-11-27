"""Domain enumerations for inventory events and feed health."""

from enum import StrEnum


class InventoryEventType(StrEnum):
    """Supported inventory event types."""

    STOCK_RECEIVED = "STOCK_RECEIVED"
    STOCK_DISPATCHED = "STOCK_DISPATCHED"
    PHYSICAL_COUNT = "PHYSICAL_COUNT"
    STOCK_RESERVED = "STOCK_RESERVED"
    STOCK_RELEASED = "STOCK_RELEASED"
    STOCK_ADJUSTED = "STOCK_ADJUSTED"


class FeedStatus(StrEnum):
    """Operational status values for event feed sources."""

    HEALTHY = "HEALTHY"
    STALE = "STALE"
    DEGRADED = "DEGRADED"
    UNKNOWN = "UNKNOWN"
