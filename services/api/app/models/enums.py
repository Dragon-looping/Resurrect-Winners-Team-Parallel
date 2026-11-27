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


class OrderStatus(StrEnum):
    """Lifecycle states for a customer order."""

    CREATED = "CREATED"
    ALLOCATED = "ALLOCATED"
    PARTIALLY_ALLOCATED = "PARTIALLY_ALLOCATED"
    BACKLOGGED = "BACKLOGGED"
    OFFER_SENT = "OFFER_SENT"
    CONFIRMED = "CONFIRMED"
    READY_FOR_DISPATCH = "READY_FOR_DISPATCH"
    DISPATCHED = "DISPATCHED"
    CANCELLED = "CANCELLED"


class OfferStatus(StrEnum):
    """Status values for customer delivery offers."""

    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class PlanStatus(StrEnum):
    """Status values for deterministic order plans."""

    PREVIEW = "PREVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class ProductionBatchStatus(StrEnum):
    """Status values for manufacturing production batches."""

    PLANNED = "PLANNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class RecoveryType(StrEnum):
    """Types of godown stock recovery."""

    SURPLUS_TRANSFER = "SURPLUS_TRANSFER"
    ORDER_SWAP = "ORDER_SWAP"


class RecoveryStatus(StrEnum):
    """Approval lifecycle status for a recovery plan."""

    PREVIEW = "PREVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ProcurementRole(StrEnum):
    """Authorized operational roles for procurement and briefings."""

    WAREHOUSE_MANAGER = "WAREHOUSE_MANAGER"
    PROCUREMENT_OFFICER = "PROCUREMENT_OFFICER"
    ADMINISTRATOR = "ADMINISTRATOR"
    PLANNER = "PLANNER"
    CUSTOMER = "CUSTOMER"
    AI_SYSTEM = "AI_SYSTEM"


class UrgencyLevel(StrEnum):
    """Urgency classification for shortages and proposals."""

    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ProposalStatus(StrEnum):
    """Lifecycle states for a purchase proposal."""

    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    ORDER_CREATED = "ORDER_CREATED"


class PurchaseOrderStatus(StrEnum):
    """Lifecycle states for a purchase order."""

    CREATED = "CREATED"
    READY_TO_SEND = "READY_TO_SEND"
    SENT = "SENT"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    FULFILLED = "FULFILLED"
    CANCELLED = "CANCELLED"


class EmailDeliveryStatus(StrEnum):
    """Delivery lifecycle states for supplier purchase order emails."""

    PREVIEWED = "PREVIEWED"
    CONFIRMED_PENDING = "CONFIRMED_PENDING"
    SENT = "SENT"
    FAILED = "FAILED"
    SIMULATED_UNCONFIGURED = "SIMULATED_UNCONFIGURED"
