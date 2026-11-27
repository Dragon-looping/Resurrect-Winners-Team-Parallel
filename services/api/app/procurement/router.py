"""FastAPI router for SETUVYUHA Procurement & Briefings (Branch 3)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.gateway import AIGatewayService
from app.ai.router import get_ai_gateway
from app.cases.router import get_case_service
from app.cases.service import CaseSteeringService
from app.core.database import get_db
from app.models.enums import (
    EmailDeliveryStatus,
    ProposalStatus,
    PurchaseOrderStatus,
    UrgencyLevel,
)
from app.models.procurement import PurchaseOrder, PurchaseProposal, SupplierEmailLog
from app.procurement.approval_service import (
    approve_proposal,
    list_approval_queue,
    reject_proposal,
)
from app.procurement.audit import get_audit_trail_responses, get_proposal_approval_history
from app.procurement.auth import ActorContext, get_actor_context
from app.procurement.briefing_service import generate_role_briefing
from app.procurement.config import get_email_config
from app.procurement.email_service import (
    list_email_logs,
    preview_supplier_email,
    send_confirmed_supplier_email,
)
from app.procurement.po_service import (
    create_purchase_order_from_proposal,
    get_purchase_order,
    list_purchase_orders,
    transition_po_status,
)
from app.procurement.proposal_service import (
    cancel_proposal,
    generate_purchase_proposal,
    get_proposal,
    list_proposals,
    submit_proposal_for_approval,
)
from app.procurement.schemas import (
    AuditLogResponse,
    BriefingRequest,
    BriefingResponse,
    EmailLogResponse,
    EmailPreviewResponse,
    EmailSendConfirmRequest,
    ProcurementDashboardResponse,
    ProposalApproveRequest,
    ProposalGenerateRequest,
    ProposalRejectRequest,
    ProposalSubmitRequest,
    PurchaseOrderCreateRequest,
    PurchaseOrderResponse,
    PurchaseOrderStatusUpdateRequest,
    PurchaseProposalResponse,
    ShortageAlertResponse,
)
from app.procurement.shortage_service import list_procurement_shortages

procurement_router = APIRouter(prefix="/procurement", tags=["Procurement & Briefings"])


@procurement_router.get(
    "/dashboard",
    response_model=ProcurementDashboardResponse,
    summary="Procurement operational dashboard KPIs",
)
def get_procurement_dashboard(
    db: Session = Depends(get_db),
    _actor: ActorContext = Depends(get_actor_context),
) -> ProcurementDashboardResponse:
    """Return live aggregate procurement KPIs derived from database records."""
    shortages = list_procurement_shortages(db, include_with_active_proposal=True)
    proposals = list(db.execute(select(PurchaseProposal)).scalars().all())
    pos = list(db.execute(select(PurchaseOrder)).scalars().all())
    sent_count = len(
        db.execute(
            select(SupplierEmailLog).where(
                SupplierEmailLog.delivery_status == EmailDeliveryStatus.SENT.value
            )
        )
        .scalars()
        .all()
    )

    proposals_by_status: dict[str, int] = {}
    for p in proposals:
        proposals_by_status[p.status] = proposals_by_status.get(p.status, 0) + 1

    po_by_status: dict[str, int] = {}
    for po in pos:
        po_by_status[po.status] = po_by_status.get(po.status, 0) + 1

    approved_exposure = round(
        sum(
            po.total_amount
            for po in pos
            if po.status != PurchaseOrderStatus.CANCELLED.value
        ),
        2,
    )
    pending_exposure = round(
        sum(
            p.estimated_total_price
            for p in proposals
            if p.status == ProposalStatus.PENDING_APPROVAL.value
        ),
        2,
    )

    return ProcurementDashboardResponse(
        active_shortages_count=len(shortages),
        critical_shortages_count=sum(
            1 for s in shortages if s.urgency_level == UrgencyLevel.CRITICAL
        ),
        proposals_by_status=proposals_by_status,
        purchase_orders_by_status=po_by_status,
        total_approved_exposure_inr=approved_exposure,
        pending_approval_exposure_inr=pending_exposure,
        emails_sent_count=sent_count,
        email_integration_configured=get_email_config().is_configured,
    )


@procurement_router.get(
    "/shortages",
    response_model=list[ShortageAlertResponse],
    summary="List live shortage alerts connected to procurement",
)
def get_procurement_shortages(
    plant_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    include_with_active_proposal: bool = Query(default=True),
    db: Session = Depends(get_db),
    _actor: ActorContext = Depends(get_actor_context),
) -> list[ShortageAlertResponse]:
    """Retrieve shortage alerts from the existing fulfilment risk engine."""
    alerts = list_procurement_shortages(
        db,
        plant_id=plant_id,
        sku_id=sku_id,
        include_with_active_proposal=include_with_active_proposal,
    )
    return [ShortageAlertResponse(**alert.__dict__) for alert in alerts]


@procurement_router.post(
    "/proposals/generate",
    response_model=PurchaseProposalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate an AI-assisted purchase proposal from a shortage",
)
async def post_generate_proposal(
    payload: ProposalGenerateRequest,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    ai_gateway: AIGatewayService = Depends(get_ai_gateway),
    case_service: CaseSteeringService = Depends(get_case_service),
) -> PurchaseProposalResponse:
    """Generate a grounded purchase proposal reusing Branch 1 AI Gateway & Branch 2 cases."""
    return await generate_purchase_proposal(
        db,
        payload,
        actor,
        ai_gateway=ai_gateway,
        case_service=case_service,
    )


@procurement_router.get(
    "/proposals",
    response_model=list[PurchaseProposalResponse],
    summary="List purchase proposals",
)
def get_proposals(
    status_filter: ProposalStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _actor: ActorContext = Depends(get_actor_context),
) -> list[PurchaseProposalResponse]:
    """List purchase proposals, optionally filtered by status."""
    return list_proposals(db, status_filter=status_filter)


@procurement_router.get(
    "/proposals/{proposal_id}",
    response_model=PurchaseProposalResponse,
    summary="Get purchase proposal details",
)
def get_proposal_by_id(
    proposal_id: int,
    db: Session = Depends(get_db),
    _actor: ActorContext = Depends(get_actor_context),
) -> PurchaseProposalResponse:
    """Retrieve a single purchase proposal by ID."""
    return get_proposal(db, proposal_id)


@procurement_router.post(
    "/proposals/{proposal_id}/submit",
    response_model=PurchaseProposalResponse,
    summary="Submit a DRAFT proposal for human approval",
)
def post_submit_proposal(
    proposal_id: int,
    payload: ProposalSubmitRequest,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> PurchaseProposalResponse:
    """Submit a DRAFT proposal into PENDING_APPROVAL."""
    return submit_proposal_for_approval(
        db,
        proposal_id,
        expected_version=payload.expected_version,
        actor=actor,
        notes=payload.notes,
    )


@procurement_router.post(
    "/proposals/{proposal_id}/cancel",
    response_model=PurchaseProposalResponse,
    summary="Cancel a DRAFT or PENDING_APPROVAL proposal",
)
def post_cancel_proposal(
    proposal_id: int,
    payload: ProposalSubmitRequest,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> PurchaseProposalResponse:
    """Cancel an unapproved purchase proposal."""
    return cancel_proposal(
        db,
        proposal_id,
        expected_version=payload.expected_version,
        actor=actor,
        reason=payload.notes,
    )


@procurement_router.get(
    "/approvals/queue",
    response_model=list[PurchaseProposalResponse],
    summary="List proposals awaiting human approval",
)
def get_approval_queue(
    db: Session = Depends(get_db),
    _actor: ActorContext = Depends(get_actor_context),
) -> list[PurchaseProposalResponse]:
    """Return all proposals in PENDING_APPROVAL status."""
    return list_approval_queue(db)


@procurement_router.post(
    "/proposals/{proposal_id}/approve",
    response_model=PurchaseProposalResponse,
    summary="Human-only approval of a purchase proposal",
)
def post_approve_proposal(
    proposal_id: int,
    payload: ProposalApproveRequest,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> PurchaseProposalResponse:
    """Approve a pending purchase proposal (strictly human approvers only)."""
    return approve_proposal(
        db,
        proposal_id,
        expected_version=payload.expected_version,
        actor=actor,
        approval_notes=payload.approval_notes,
    )


@procurement_router.post(
    "/proposals/{proposal_id}/reject",
    response_model=PurchaseProposalResponse,
    summary="Human-only rejection of a purchase proposal with mandatory reason",
)
def post_reject_proposal(
    proposal_id: int,
    payload: ProposalRejectRequest,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> PurchaseProposalResponse:
    """Reject a pending purchase proposal with a mandatory rejection reason."""
    return reject_proposal(
        db,
        proposal_id,
        expected_version=payload.expected_version,
        actor=actor,
        reason=payload.reason,
    )


@procurement_router.get(
    "/proposals/{proposal_id}/history",
    response_model=list[AuditLogResponse],
    summary="Get approval and audit history for a proposal",
)
def get_proposal_history(
    proposal_id: int,
    db: Session = Depends(get_db),
    _actor: ActorContext = Depends(get_actor_context),
) -> list[AuditLogResponse]:
    """Return chronological audit trail for a purchase proposal."""
    return get_proposal_approval_history(db, proposal_id)


@procurement_router.post(
    "/purchase-orders",
    response_model=PurchaseOrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a Purchase Order from an APPROVED proposal",
)
def post_create_purchase_order(
    payload: PurchaseOrderCreateRequest,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> PurchaseOrderResponse:
    """Create a transaction-safe Purchase Order from an approved proposal."""
    return create_purchase_order_from_proposal(db, payload, actor)


@procurement_router.get(
    "/purchase-orders",
    response_model=list[PurchaseOrderResponse],
    summary="List Purchase Orders",
)
def get_purchase_orders(
    status_filter: PurchaseOrderStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _actor: ActorContext = Depends(get_actor_context),
) -> list[PurchaseOrderResponse]:
    """List Purchase Orders, optionally filtered by status."""
    return list_purchase_orders(db, status_filter=status_filter)


@procurement_router.get(
    "/purchase-orders/{po_id}",
    response_model=PurchaseOrderResponse,
    summary="Get Purchase Order details",
)
def get_purchase_order_by_id(
    po_id: int,
    db: Session = Depends(get_db),
    _actor: ActorContext = Depends(get_actor_context),
) -> PurchaseOrderResponse:
    """Retrieve a single Purchase Order by ID."""
    return get_purchase_order(db, po_id)


@procurement_router.post(
    "/purchase-orders/{po_id}/status",
    response_model=PurchaseOrderResponse,
    summary="Transition Purchase Order lifecycle status",
)
def post_transition_po_status(
    po_id: int,
    payload: PurchaseOrderStatusUpdateRequest,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> PurchaseOrderResponse:
    """Advance or cancel a Purchase Order using validated state transitions."""
    return transition_po_status(
        db,
        po_id,
        target_status=payload.target_status,
        expected_version=payload.expected_version,
        actor=actor,
        notes=payload.notes,
    )


@procurement_router.post(
    "/purchase-orders/{po_id}/email/preview",
    response_model=EmailPreviewResponse,
    summary="Preview supplier Purchase Order email",
)
def post_preview_po_email(
    po_id: int,
    custom_note: str | None = Query(default=None, max_length=1000),
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> EmailPreviewResponse:
    """Generate a supplier PO email preview and report SMTP integration status."""
    return preview_supplier_email(db, po_id, actor, custom_note=custom_note)


@procurement_router.post(
    "/purchase-orders/{po_id}/email/send",
    response_model=EmailLogResponse,
    summary="Send supplier Purchase Order email after explicit human confirmation",
)
def post_send_po_email(
    po_id: int,
    payload: EmailSendConfirmRequest,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> EmailLogResponse:
    """Send a confirmed supplier PO email using configured SMTP or record honest status."""
    return send_confirmed_supplier_email(
        db,
        po_id,
        actor,
        human_confirmed=payload.human_confirmed,
        custom_note=payload.custom_note,
    )


@procurement_router.get(
    "/email-logs",
    response_model=list[EmailLogResponse],
    summary="List supplier email delivery logs",
)
def get_email_logs(
    po_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _actor: ActorContext = Depends(get_actor_context),
) -> list[EmailLogResponse]:
    """Return supplier email preview and delivery logs."""
    return list_email_logs(db, po_id=po_id)


@procurement_router.get(
    "/audit-logs",
    response_model=list[AuditLogResponse],
    summary="List procurement audit logs",
)
def get_audit_logs(
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _actor: ActorContext = Depends(get_actor_context),
) -> list[AuditLogResponse]:
    """Return procurement audit trail entries."""
    return get_audit_trail_responses(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        limit=limit,
    )


@procurement_router.post(
    "/briefings",
    response_model=BriefingResponse,
    summary="Generate role-specific AI operational briefing",
)
async def post_generate_briefing(
    payload: BriefingRequest,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
    ai_gateway: AIGatewayService = Depends(get_ai_gateway),
) -> BriefingResponse:
    """Generate a role-grounded operational briefing for Warehouse Manager, Procurement Officer, or Administrator."""
    return await generate_role_briefing(
        db,
        target_role=payload.target_role,
        actor=actor,
        ai_gateway=ai_gateway,
    )
