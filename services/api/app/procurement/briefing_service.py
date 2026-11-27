"""Role-specific AI operational briefings grounded in live procurement & inventory data."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.gateway import AIGatewayService
from app.ai.schemas import AuthoritativeMetrics, EvidenceItem, GatewayRequest, TaskType
from app.models import InventoryBalance, Plant, SKU
from app.models.enums import (
    EmailDeliveryStatus,
    ProcurementRole,
    ProposalStatus,
    PurchaseOrderStatus,
    UrgencyLevel,
)
from app.models.procurement import (
    PurchaseOrder,
    PurchaseProposal,
    Supplier,
    SupplierEmailLog,
)
from app.procurement.audit import record_audit_log
from app.procurement.auth import ActorContext, require_briefing_access
from app.procurement.config import get_email_config
from app.procurement.schemas import BriefingIssue, BriefingResponse
from app.procurement.shortage_service import list_procurement_shortages


async def generate_role_briefing(
    db: Session,
    *,
    target_role: ProcurementRole,
    actor: ActorContext,
    ai_gateway: AIGatewayService,
) -> BriefingResponse:
    """Generate a role-specific operational briefing using live DB facts and Branch 1 AI Gateway."""
    require_briefing_access(actor, target_role)
    now_utc = datetime.now(timezone.utc)

    shortages = list_procurement_shortages(db, include_with_active_proposal=True, as_of=now_utc)
    proposals = list(db.execute(select(PurchaseProposal)).scalars().all())
    pos = list(db.execute(select(PurchaseOrder)).scalars().all())
    email_logs = list(db.execute(select(SupplierEmailLog)).scalars().all())
    balances = list(db.execute(select(InventoryBalance)).scalars().all())
    suppliers = list(db.execute(select(Supplier).where(Supplier.is_active.is_(True))).scalars().all())
    plants_by_id = {p.id: p for p in db.execute(select(Plant)).scalars().all()}
    skus_by_id = {s.id: s for s in db.execute(select(SKU)).scalars().all()}

    critical_shortages = [s for s in shortages if s.urgency_level == UrgencyLevel.CRITICAL]
    stale_shortages = [s for s in shortages if s.feed_is_stale]
    pending_proposals = [p for p in proposals if p.status == ProposalStatus.PENDING_APPROVAL.value]
    draft_proposals = [p for p in proposals if p.status == ProposalStatus.DRAFT.value]
    approved_unissued = [p for p in proposals if p.status == ProposalStatus.APPROVED.value]
    incoming_pos = [
        po
        for po in pos
        if po.status in {
            PurchaseOrderStatus.CREATED.value,
            PurchaseOrderStatus.READY_TO_SEND.value,
            PurchaseOrderStatus.SENT.value,
            PurchaseOrderStatus.ACKNOWLEDGED.value,
        }
    ]
    failed_emails = [e for e in email_logs if e.delivery_status == EmailDeliveryStatus.FAILED.value]
    sent_emails = [e for e in email_logs if e.delivery_status == EmailDeliveryStatus.SENT.value]
    critical_stock = [b for b in balances if b.available_stock <= 10]

    pending_exposure = round(sum(p.estimated_total_price for p in pending_proposals), 2)
    approved_po_exposure = round(sum(po.total_amount for po in pos if po.status != PurchaseOrderStatus.CANCELLED.value), 2)
    email_cfg = get_email_config()

    evidence_items: list[EvidenceItem] = []
    supporting_evidence: list[dict[str, Any]] = []
    critical_observations: list[str] = []
    priority_issues: list[BriefingIssue] = []
    recommended_actions: list[str] = []
    metrics_snapshot: dict[str, Any] = {}

    if target_role == ProcurementRole.WAREHOUSE_MANAGER:
        metrics_snapshot = {
            "active_shortages": len(shortages),
            "critical_shortages": len(critical_shortages),
            "critical_stock_positions": len(critical_stock),
            "incoming_purchase_orders": len(incoming_pos),
            "stale_feed_alerts": len(stale_shortages),
        }
        for idx, s in enumerate(shortages[:5], start=1):
            ev_id = s.shortage_ref
            detail = (
                f"{s.sku_name} ({s.sku_code}) at {s.plant_name}: shortage {s.shortage_quantity} {s.unit} "
                f"(available {s.available_quantity}, required {s.required_quantity})."
            )
            evidence_items.append(
                EvidenceItem(evidence_id=ev_id, source_type="shortage", summary=detail)
            )
            supporting_evidence.append({"evidence_id": ev_id, "type": "shortage", "summary": detail})
            priority_issues.append(
                BriefingIssue(
                    priority=idx,
                    severity=s.urgency_level.value,
                    title=f"Shortage: {s.sku_code} at {s.plant_name}",
                    detail=detail,
                    evidence_ref=ev_id,
                )
            )
        for b in critical_stock[:3]:
            plant = plants_by_id.get(b.plant_id)
            sku = skus_by_id.get(b.sku_id)
            obs = (
                f"Low stock: {sku.sku_code if sku else b.sku_id} at "
                f"{plant.name if plant else b.plant_id} has {b.available_stock} available."
            )
            critical_observations.append(obs)
        if not critical_observations:
            critical_observations.append(
                f"{len(shortages)} active order shortages and {len(incoming_pos)} incoming POs tracked."
            )
        if stale_shortages:
            critical_observations.append(
                f"{len(stale_shortages)} shortage items flagged with stale inventory telemetry feeds."
            )
        recommended_actions = [
            f"Prioritize dock receiving for {len(incoming_pos)} incoming Purchase Orders.",
            f"Reconcile physical counts on {len(critical_stock)} low-stock SKU-plant positions." if critical_stock else "Maintain cycle count cadence across active godowns.",
            "Trigger procurement proposals for shortages without active coverage." if any(not s.has_active_proposal for s in shortages) else "Monitor active procurement proposals through approval.",
        ]

    elif target_role == ProcurementRole.PROCUREMENT_OFFICER:
        metrics_snapshot = {
            "pending_approval_proposals": len(pending_proposals),
            "draft_proposals": len(draft_proposals),
            "approved_awaiting_po": len(approved_unissued),
            "active_suppliers": len(suppliers),
            "pending_approval_exposure_inr": pending_exposure,
            "total_po_spend_inr": approved_po_exposure,
            "emails_sent": len(sent_emails),
            "emails_failed": len(failed_emails),
        }
        for idx, p in enumerate(pending_proposals[:5], start=1):
            ev_id = p.proposal_code
            detail = (
                f"{p.proposal_code} ({p.urgency_level}): {p.recommended_quantity} units, "
                f"INR {p.estimated_total_price:,.2f}, awaiting human approval."
            )
            evidence_items.append(EvidenceItem(evidence_id=ev_id, source_type="proposal", summary=detail))
            supporting_evidence.append({"evidence_id": ev_id, "type": "proposal", "summary": detail})
            priority_issues.append(
                BriefingIssue(
                    priority=idx,
                    severity=p.urgency_level,
                    title=f"Pending Approval: {p.proposal_code}",
                    detail=detail,
                    evidence_ref=ev_id,
                )
            )
        if not priority_issues and shortages:
            top = shortages[0]
            priority_issues.append(
                BriefingIssue(
                    priority=1,
                    severity=top.urgency_level.value,
                    title=f"Unaddressed Shortage: {top.shortage_ref}",
                    detail=f"{top.shortage_quantity} {top.unit} needed for {top.order_number}.",
                    evidence_ref=top.shortage_ref,
                )
            )
        critical_observations = [
            f"{len(pending_proposals)} proposals pending human approval (INR {pending_exposure:,.2f}).",
            f"{len(approved_unissued)} approved proposals ready for Purchase Order creation.",
            f"Supplier email integration status: {'CONFIGURED' if email_cfg.is_configured else 'NOT_CONFIGURED'} ({len(sent_emails)} sent, {len(failed_emails)} failed).",
        ]
        recommended_actions = [
            "Review and approve or reject items in the Approval Queue.",
            "Generate Purchase Orders for all APPROVED proposals.",
            "Preview and confirm supplier PO emails for newly created Purchase Orders.",
        ]

    else:  # ADMINISTRATOR
        metrics_snapshot = {
            "active_shortages": len(shortages),
            "critical_shortages": len(critical_shortages),
            "pending_approvals": len(pending_proposals),
            "pending_financial_exposure_inr": pending_exposure,
            "committed_po_exposure_inr": approved_po_exposure,
            "total_purchase_orders": len(pos),
            "failed_email_deliveries": len(failed_emails),
            "email_integration_configured": email_cfg.is_configured,
        }
        rank = 1
        for s in critical_shortages[:3]:
            detail = f"Critical shortage {s.shortage_ref}: {s.shortage_quantity} {s.unit} for {s.customer_name}."
            evidence_items.append(EvidenceItem(evidence_id=s.shortage_ref, source_type="shortage", summary=detail))
            supporting_evidence.append({"evidence_id": s.shortage_ref, "type": "shortage", "summary": detail})
            priority_issues.append(
                BriefingIssue(
                    priority=rank,
                    severity="CRITICAL",
                    title=f"Critical Fulfilment Shortage ({s.shortage_ref})",
                    detail=detail,
                    evidence_ref=s.shortage_ref,
                )
            )
            rank += 1
        for p in pending_proposals[:3]:
            detail = f"{p.proposal_code} awaiting approval for INR {p.estimated_total_price:,.2f}."
            evidence_items.append(EvidenceItem(evidence_id=p.proposal_code, source_type="proposal", summary=detail))
            supporting_evidence.append({"evidence_id": p.proposal_code, "type": "proposal", "summary": detail})
            priority_issues.append(
                BriefingIssue(
                    priority=rank,
                    severity=p.urgency_level,
                    title=f"Approval Bottleneck ({p.proposal_code})",
                    detail=detail,
                    evidence_ref=p.proposal_code,
                )
            )
            rank += 1

        critical_observations = [
            f"Committed PO financial exposure: INR {approved_po_exposure:,.2f}; pending approval exposure: INR {pending_exposure:,.2f}.",
            f"Operational bottlenecks: {len(pending_proposals)} pending approvals, {len(approved_unissued)} approved proposals awaiting POs, {len(failed_emails)} failed email attempts.",
            f"Critical shortages: {len(critical_shortages)} of {len(shortages)} active shortages.",
        ]
        recommended_actions = [
            "Clear pending human approval bottlenecks on CRITICAL proposals.",
            "Verify SMTP credentials if automated supplier email dispatch is required." if not email_cfg.is_configured else "Audit failed supplier email deliveries.",
            "Review financial exposure across committed and pending procurement commitments.",
        ]

    if not evidence_items:
        evidence_items.append(
            EvidenceItem(
                evidence_id="PROC-SYSTEM-STATE",
                source_type="operational_snapshot",
                summary=f"Live snapshot for {target_role.value}: {metrics_snapshot}",
                authoritative_values=metrics_snapshot,
            )
        )
        supporting_evidence.append(
            {
                "evidence_id": "PROC-SYSTEM-STATE",
                "type": "operational_snapshot",
                "summary": f"Live snapshot for {target_role.value}",
            }
        )

    gateway_req = GatewayRequest(
        task_type=TaskType.SUMMARY,
        prompt=(
            f"Generate an executive operational briefing summary for {target_role.value} "
            f"based strictly on the supplied live metrics and evidence items. "
            f"Do not invent any figures."
        ),
        system_instruction="You are an enterprise operations analyst. Cite only provided evidence.",
        evidence=evidence_items,
        authoritative_metrics=AuthoritativeMetrics(
            quantities={
                "active_shortages": len(shortages),
                "pending_approvals": len(pending_proposals),
                "purchase_orders": len(pos),
            },
            monetary_amounts={
                "pending_exposure_inr": pending_exposure,
                "committed_po_exposure_inr": approved_po_exposure,
            },
            currency="INR",
            allow_ai_numeric_estimates=False,
        ),
        required_fields=["summary"],
    )
    ai_res = await ai_gateway.execute(gateway_req)

    record_audit_log(
        db,
        entity_type="BRIEFING",
        entity_id=target_role.value,
        action="BRIEFING_GENERATED",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={
            "target_role": target_role.value,
            "ai_execution_mode": ai_res.execution_mode.value,
            "fallback_used": ai_res.fallback_used,
        },
    )
    db.commit()

    return BriefingResponse(
        role=target_role,
        generated_at=now_utc,
        executive_summary=ai_res.output.summary,
        critical_observations=critical_observations,
        priority_ranked_issues=priority_issues,
        supporting_evidence=supporting_evidence,
        recommended_actions=recommended_actions,
        metrics_snapshot=metrics_snapshot,
        ai_execution_mode=ai_res.execution_mode.value,
        fallback_used=ai_res.fallback_used,
    )
