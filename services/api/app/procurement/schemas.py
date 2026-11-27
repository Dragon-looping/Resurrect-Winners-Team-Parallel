"""Pydantic v2 request and response schemas for Procurement & Briefings."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models.enums import (
    EmailDeliveryStatus,
    ProcurementRole,
    ProposalStatus,
    PurchaseOrderStatus,
    UrgencyLevel,
)


class SupplierOptionResponse(BaseModel):
    """Verified supplier catalog option."""

    supplier_id: int
    supplier_code: str
    name: str
    contact_name: str
    contact_email: str
    phone: str
    location: str
    unit_price_inr: float
    min_order_qty: int
    lead_time_days: int
    reliability_score: float
    is_preferred: bool


class ShortageAlertResponse(BaseModel):
    """Shortage alert exposed to procurement from existing fulfilment risk engine."""

    shortage_ref: str
    order_id: int
    order_number: str
    customer_name: str
    plant_id: int
    plant_name: str
    plant_location: str
    sku_id: int
    sku_code: str
    sku_name: str
    unit: str
    agreed_delivery_date: datetime
    required_quantity: int
    available_quantity: int
    shortage_quantity: int
    urgency_level: UrgencyLevel
    severity_score: float
    risk_classification: str
    feed_is_stale: bool
    affected_departments: list[str]
    has_active_proposal: bool
    active_proposal_id: int | None = None
    active_proposal_code: str | None = None


class HistoricalCaseRef(BaseModel):
    """Reference to a supporting historical case from Branch 2."""

    case_id: str
    title: str
    similarity_score: float
    resolution_type: str
    outcome_summary: str


class ProposalGenerateRequest(BaseModel):
    """Request to generate an AI-assisted purchase proposal from a shortage."""

    shortage_ref: str = Field(..., min_length=1, max_length=80)
    preferred_supplier_id: int | None = None
    delivery_notes: str | None = Field(default=None, max_length=500)

    @field_validator("shortage_ref")
    @classmethod
    def _strip_ref(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("shortage_ref must not be blank.")
        return stripped


class ProposalSubmitRequest(BaseModel):
    """Submit a DRAFT proposal for human approval."""

    expected_version: int = Field(..., ge=1)
    notes: str | None = Field(default=None, max_length=500)


class ProposalApproveRequest(BaseModel):
    """Human approval of a PENDING_APPROVAL proposal."""

    expected_version: int = Field(..., ge=1)
    approval_notes: str | None = Field(default=None, max_length=500)


class ProposalRejectRequest(BaseModel):
    """Human rejection of a PENDING_APPROVAL proposal with mandatory reason."""

    expected_version: int = Field(..., ge=1)
    reason: str = Field(..., min_length=3, max_length=1000)

    @field_validator("reason")
    @classmethod
    def _require_non_blank_reason(cls, v: str) -> str:
        stripped = v.strip()
        if len(stripped) < 3:
            raise ValueError("Rejection reason must be at least 3 non-whitespace characters.")
        return stripped


class PurchaseProposalResponse(BaseModel):
    """Full purchase proposal separating verified facts from AI-generated suggestions."""

    id: int
    proposal_code: str
    shortage_ref: str
    order_id: int | None
    plant_id: int
    plant_name: str
    sku_id: int
    sku_code: str
    sku_name: str
    unit: str

    required_quantity: int
    available_quantity: int
    shortage_quantity: int
    recommended_quantity: int
    estimated_unit_price: float
    estimated_total_price: float
    currency: str

    preferred_supplier: SupplierOptionResponse
    alternative_suppliers: list[dict[str, Any]]
    delivery_requirements: dict[str, Any]
    urgency_level: UrgencyLevel
    affected_departments: list[str]

    ai_justification: str
    risk_assessment: str
    historical_case_refs: list[HistoricalCaseRef]
    ai_execution_mode: str
    ai_grounding_notes: dict[str, Any]

    status: ProposalStatus
    version: int
    created_by: str
    submitted_by: str | None = None
    submitted_at: datetime | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None
    rejected_by: str | None = None
    rejected_at: datetime | None = None
    rejection_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class PurchaseOrderCreateRequest(BaseModel):
    """Create a Purchase Order from an APPROVED proposal."""

    proposal_id: int = Field(..., ge=1)
    delivery_notes: str | None = Field(default=None, max_length=500)


class PurchaseOrderStatusUpdateRequest(BaseModel):
    """Transition a Purchase Order to a valid next lifecycle state."""

    target_status: PurchaseOrderStatus
    expected_version: int = Field(..., ge=1)
    notes: str | None = Field(default=None, max_length=500)


class PurchaseOrderResponse(BaseModel):
    """Purchase Order response contract."""

    id: int
    po_number: str
    proposal_id: int
    proposal_code: str
    supplier_id: int
    supplier_code: str
    supplier_name: str
    supplier_email: str
    plant_id: int
    plant_name: str
    sku_id: int
    sku_code: str
    sku_name: str
    unit: str
    approved_quantity: int
    unit_price: float
    total_amount: float
    currency: str
    delivery_info: dict[str, Any]
    approval_reference: str
    approved_by: str
    status: PurchaseOrderStatus
    version: int
    created_at: datetime
    updated_at: datetime


class EmailPreviewResponse(BaseModel):
    """Generated supplier PO email preview with integration status."""

    purchase_order_id: int
    po_number: str
    recipient_name: str
    recipient_email: str
    subject: str
    body_text: str
    body_html: str
    integration_status: str
    smtp_host_configured: bool
    requires_human_confirmation: bool = True
    previewed_at: datetime


class EmailSendConfirmRequest(BaseModel):
    """Human-confirmed supplier email dispatch request."""

    human_confirmed: bool
    custom_note: str | None = Field(default=None, max_length=1000)


class EmailLogResponse(BaseModel):
    """Recorded supplier email attempt and outcome."""

    id: int
    purchase_order_id: int
    recipient_email: str
    recipient_name: str
    subject: str
    body_text: str
    integration_status: str
    delivery_status: EmailDeliveryStatus
    confirmed_by: str | None = None
    confirmed_at: datetime | None = None
    sent_at: datetime | None = None
    error_message: str | None = None
    provider_message_id: str | None = None
    created_at: datetime


class AuditLogResponse(BaseModel):
    """Procurement audit log entry."""

    id: int
    entity_type: str
    entity_id: str
    action: str
    actor_id: str
    actor_role: str
    details: dict[str, Any]
    created_at: datetime


class BriefingRequest(BaseModel):
    """Request to generate a role-specific AI operational briefing."""

    target_role: ProcurementRole


class BriefingIssue(BaseModel):
    """Priority-ranked operational issue grounded in actual database records."""

    priority: int = Field(..., ge=1)
    severity: str
    title: str
    detail: str
    evidence_ref: str


class BriefingResponse(BaseModel):
    """Role-specific AI operational briefing response."""

    role: ProcurementRole
    generated_at: datetime
    executive_summary: str
    critical_observations: list[str]
    priority_ranked_issues: list[BriefingIssue]
    supporting_evidence: list[dict[str, Any]]
    recommended_actions: list[str]
    metrics_snapshot: dict[str, Any]
    ai_execution_mode: str
    fallback_used: bool


class ProcurementDashboardResponse(BaseModel):
    """Aggregate live procurement KPIs and pipeline counts."""

    active_shortages_count: int
    critical_shortages_count: int
    proposals_by_status: dict[str, int]
    purchase_orders_by_status: dict[str, int]
    total_approved_exposure_inr: float
    pending_approval_exposure_inr: float
    emails_sent_count: int
    email_integration_configured: bool
