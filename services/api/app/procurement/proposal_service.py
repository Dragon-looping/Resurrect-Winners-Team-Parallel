"""AI-assisted purchase proposal generation grounded in verified shortage & supplier data."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.gateway import AIGatewayService
from app.ai.schemas import AuthoritativeMetrics, EvidenceItem, GatewayRequest, TaskType
from app.cases.schemas import CaseSearchRequest
from app.cases.service import CaseSteeringService
from app.models import Plant, SKU
from app.models.enums import ProposalStatus, UrgencyLevel
from app.models.procurement import PurchaseProposal, Supplier, SupplierCatalogItem
from app.procurement.audit import record_audit_log
from app.procurement.auth import ActorContext
from app.procurement.schemas import (
    HistoricalCaseRef,
    ProposalGenerateRequest,
    PurchaseProposalResponse,
    SupplierOptionResponse,
)
from app.procurement.shortage_service import ACTIVE_PROPOSAL_STATUSES, get_shortage_by_ref
from app.procurement.suppliers import ensure_verified_suppliers_for_sku


def _build_supplier_option(supplier: Supplier, catalog: SupplierCatalogItem) -> SupplierOptionResponse:
    return SupplierOptionResponse(
        supplier_id=supplier.id,
        supplier_code=supplier.supplier_code,
        name=supplier.name,
        contact_name=supplier.contact_name,
        contact_email=supplier.contact_email,
        phone=supplier.phone,
        location=supplier.location,
        unit_price_inr=catalog.unit_price_inr,
        min_order_qty=catalog.min_order_qty,
        lead_time_days=catalog.lead_time_days,
        reliability_score=supplier.reliability_score,
        is_preferred=catalog.is_preferred,
    )


def _to_proposal_response(db: Session, proposal: PurchaseProposal) -> PurchaseProposalResponse:
    plant = db.execute(select(Plant).where(Plant.id == proposal.plant_id)).scalar_one()
    sku = db.execute(select(SKU).where(SKU.id == proposal.sku_id)).scalar_one()
    supplier = db.execute(select(Supplier).where(Supplier.id == proposal.preferred_supplier_id)).scalar_one()
    catalog = db.execute(
        select(SupplierCatalogItem).where(
            SupplierCatalogItem.supplier_id == supplier.id,
            SupplierCatalogItem.sku_id == sku.id,
        )
    ).scalar_one_or_none()

    pref_option = SupplierOptionResponse(
        supplier_id=supplier.id,
        supplier_code=supplier.supplier_code,
        name=supplier.name,
        contact_name=supplier.contact_name,
        contact_email=supplier.contact_email,
        phone=supplier.phone,
        location=supplier.location,
        unit_price_inr=catalog.unit_price_inr if catalog else proposal.estimated_unit_price,
        min_order_qty=catalog.min_order_qty if catalog else 1,
        lead_time_days=catalog.lead_time_days if catalog else supplier.lead_time_days,
        reliability_score=supplier.reliability_score,
        is_preferred=catalog.is_preferred if catalog else True,
    )

    return PurchaseProposalResponse(
        id=proposal.id,
        proposal_code=proposal.proposal_code,
        shortage_ref=proposal.shortage_ref,
        order_id=proposal.order_id,
        plant_id=proposal.plant_id,
        plant_name=plant.name,
        sku_id=proposal.sku_id,
        sku_code=sku.sku_code,
        sku_name=sku.name,
        unit=sku.unit,
        required_quantity=proposal.required_quantity,
        available_quantity=proposal.available_quantity,
        shortage_quantity=proposal.shortage_quantity,
        recommended_quantity=proposal.recommended_quantity,
        estimated_unit_price=proposal.estimated_unit_price,
        estimated_total_price=proposal.estimated_total_price,
        currency=proposal.currency,
        preferred_supplier=pref_option,
        alternative_suppliers=proposal.alternative_suppliers,
        delivery_requirements=proposal.delivery_requirements,
        urgency_level=UrgencyLevel(proposal.urgency_level),
        affected_departments=proposal.affected_departments,
        ai_justification=proposal.ai_justification,
        risk_assessment=proposal.risk_assessment,
        historical_case_refs=[HistoricalCaseRef(**c) for c in proposal.historical_case_refs],
        ai_execution_mode=proposal.ai_execution_mode,
        ai_grounding_notes=proposal.ai_grounding_notes,
        status=ProposalStatus(proposal.status),
        version=proposal.version,
        created_by=proposal.created_by,
        submitted_by=proposal.submitted_by,
        submitted_at=proposal.submitted_at,
        approved_by=proposal.approved_by,
        approved_at=proposal.approved_at,
        rejected_by=proposal.rejected_by,
        rejected_at=proposal.rejected_at,
        rejection_reason=proposal.rejection_reason,
        created_at=proposal.created_at,
        updated_at=proposal.updated_at,
    )


async def generate_purchase_proposal(
    db: Session,
    payload: ProposalGenerateRequest,
    actor: ActorContext,
    *,
    ai_gateway: AIGatewayService,
    case_service: CaseSteeringService,
) -> PurchaseProposalResponse:
    """Generate an AI-assisted purchase proposal for a verified shortage alert."""
    shortage = get_shortage_by_ref(db, payload.shortage_ref)
    if shortage is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active shortage alert '{payload.shortage_ref}' was not found.",
        )

    existing = db.execute(
        select(PurchaseProposal).where(
            PurchaseProposal.shortage_ref == shortage.shortage_ref,
            PurchaseProposal.status.in_(ACTIVE_PROPOSAL_STATUSES),
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"An active purchase proposal ({existing.proposal_code}, status={existing.status}) "
                f"already exists for '{shortage.shortage_ref}'."
            ),
        )

    supplier_rows = ensure_verified_suppliers_for_sku(db, shortage.sku_id)
    if not supplier_rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"No verified supplier catalog entries exist for SKU {shortage.sku_code}.",
        )

    selected_pair = supplier_rows[0]
    if payload.preferred_supplier_id is not None:
        matched = [pair for pair in supplier_rows if pair[0].id == payload.preferred_supplier_id]
        if not matched:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Supplier ID {payload.preferred_supplier_id} is not in verified catalog for SKU {shortage.sku_code}.",
            )
        selected_pair = matched[0]

    preferred_supplier, preferred_catalog = selected_pair
    alternatives = [
        _build_supplier_option(sup, cat).model_dump()
        for sup, cat in supplier_rows
        if sup.id != preferred_supplier.id
    ]

    # Deterministic calculation for recommended purchase quantity & cost
    recommended_qty = max(shortage.shortage_quantity, preferred_catalog.min_order_qty)
    unit_price = round(float(preferred_catalog.unit_price_inr), 2)
    total_price = round(recommended_qty * unit_price, 2)

    # Retrieve supporting historical cases from Branch 2
    case_query = f"{shortage.sku_name} {shortage.sku_code} {shortage.plant_name} shortage {shortage.shortage_quantity}"
    case_search = case_service.search(
        CaseSearchRequest(
            query=case_query,
            steering_direction="inter_hub_recovery",
            steering_strength=0.35,
            top_k=3,
        )
    )
    historical_refs = [
        {
            "case_id": hit.case.case_id,
            "title": hit.case.title,
            "similarity_score": round(hit.similarity_score, 4),
            "resolution_type": hit.case.resolution_type,
            "outcome_summary": hit.case.outcome_summary,
        }
        for hit in case_search.results
    ]

    evidence_items: list[EvidenceItem] = [
        EvidenceItem(
            evidence_id=shortage.shortage_ref,
            source_type="shortage_engine",
            summary=(
                f"Order {shortage.order_number} for {shortage.customer_name} at {shortage.plant_name} "
                f"requires {shortage.required_quantity} {shortage.unit} of {shortage.sku_code}; "
                f"available={shortage.available_quantity}, shortage={shortage.shortage_quantity}."
            ),
            authoritative_values={
                "required_quantity": shortage.required_quantity,
                "available_quantity": shortage.available_quantity,
                "shortage_quantity": shortage.shortage_quantity,
                "urgency_level": shortage.urgency_level.value,
            },
        ),
        EvidenceItem(
            evidence_id=preferred_supplier.supplier_code,
            source_type="verified_supplier_catalog",
            summary=(
                f"Verified supplier {preferred_supplier.name} offers {shortage.sku_code} at "
                f"INR {unit_price:.2f}/unit, MOQ {preferred_catalog.min_order_qty}, lead time {preferred_catalog.lead_time_days} days."
            ),
            authoritative_values={
                "unit_price_inr": unit_price,
                "recommended_quantity": recommended_qty,
                "estimated_total_price": total_price,
                "lead_time_days": preferred_catalog.lead_time_days,
            },
        ),
    ]
    for ref in historical_refs:
        evidence_items.append(
            EvidenceItem(
                evidence_id=ref["case_id"],
                source_type="historical_case",
                summary=f"{ref['title']} ({ref['resolution_type']}): {ref['outcome_summary']}",
                authoritative_values={"similarity_score": ref["similarity_score"]},
            )
        )

    metrics = AuthoritativeMetrics(
        quantities={
            "required_quantity": shortage.required_quantity,
            "available_quantity": shortage.available_quantity,
            "shortage_quantity": shortage.shortage_quantity,
            "recommended_quantity": recommended_qty,
        },
        monetary_amounts={
            "estimated_unit_price": unit_price,
            "estimated_total_price": total_price,
        },
        currency="INR",
        dates={"agreed_delivery_date": shortage.agreed_delivery_date.isoformat()},
        allow_ai_numeric_estimates=False,
    )

    gateway_req = GatewayRequest(
        task_type=TaskType.STRUCTURED_ANALYSIS,
        prompt=(
            f"Draft a concise procurement justification and risk assessment for {shortage.shortage_ref} "
            f"({shortage.sku_name}, shortage {shortage.shortage_quantity} {shortage.unit}) "
            f"sourcing {recommended_qty} {shortage.unit} from {preferred_supplier.name} "
            f"at INR {total_price:.2f} total. Cite only supplied evidence IDs."
        ),
        system_instruction=(
            "You are a procurement analyst. Distinguish verified facts from recommendations. "
            "Never fabricate prices, dates, or supplier availability."
        ),
        evidence=evidence_items,
        authoritative_metrics=metrics,
        required_fields=["summary", "explanation"],
    )
    ai_response = await ai_gateway.execute(gateway_req)

    ai_justification = ai_response.output.summary
    risk_assessment = (
        ai_response.output.explanation
        or (
            f"Urgency={shortage.urgency_level.value}; supplier lead time={preferred_catalog.lead_time_days} days; "
            f"feed_stale={shortage.feed_is_stale}."
        )
    )

    proposal_code = f"PROP-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
    delivery_requirements: dict[str, Any] = {
        "plant_id": shortage.plant_id,
        "plant_name": shortage.plant_name,
        "plant_location": shortage.plant_location,
        "target_delivery_date": shortage.agreed_delivery_date.isoformat(),
        "supplier_lead_time_days": preferred_catalog.lead_time_days,
        "delivery_notes": payload.delivery_notes or "Standard warehouse dock receiving",
    }
    grounding_notes: dict[str, Any] = {
        "verified_facts": {
            "shortage_quantity": shortage.shortage_quantity,
            "recommended_quantity": recommended_qty,
            "unit_price_inr": unit_price,
            "estimated_total_price": total_price,
            "supplier_code": preferred_supplier.supplier_code,
            "lead_time_days": preferred_catalog.lead_time_days,
        },
        "ai_suggestions": {
            "execution_mode": ai_response.execution_mode.value,
            "fallback_used": ai_response.fallback_used,
            "cited_evidence_ids": ai_response.output.cited_evidence_ids,
            "human_approval_required": True,
        },
    }

    proposal = PurchaseProposal(
        proposal_code=proposal_code,
        shortage_ref=shortage.shortage_ref,
        order_id=shortage.order_id,
        plant_id=shortage.plant_id,
        sku_id=shortage.sku_id,
        required_quantity=shortage.required_quantity,
        available_quantity=shortage.available_quantity,
        shortage_quantity=shortage.shortage_quantity,
        recommended_quantity=recommended_qty,
        estimated_unit_price=unit_price,
        estimated_total_price=total_price,
        currency="INR",
        preferred_supplier_id=preferred_supplier.id,
        alternative_suppliers=alternatives,
        delivery_requirements=delivery_requirements,
        urgency_level=shortage.urgency_level.value,
        affected_departments=shortage.affected_departments,
        ai_justification=ai_justification,
        risk_assessment=risk_assessment,
        historical_case_refs=historical_refs,
        ai_execution_mode=ai_response.execution_mode.value,
        ai_grounding_notes=grounding_notes,
        status=ProposalStatus.DRAFT.value,
        version=1,
        created_by=actor.actor_id,
    )
    db.add(proposal)
    db.flush()

    record_audit_log(
        db,
        entity_type="PROPOSAL",
        entity_id=proposal.proposal_code,
        action="PROPOSAL_GENERATED",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={
            "shortage_ref": shortage.shortage_ref,
            "recommended_quantity": recommended_qty,
            "estimated_total_price": total_price,
            "ai_execution_mode": ai_response.execution_mode.value,
        },
    )
    db.commit()
    db.refresh(proposal)
    return _to_proposal_response(db, proposal)


def list_proposals(
    db: Session,
    *,
    status_filter: ProposalStatus | None = None,
) -> list[PurchaseProposalResponse]:
    """List purchase proposals ordered newest-first, optionally filtered by status."""
    stmt = select(PurchaseProposal)
    if status_filter is not None:
        stmt = stmt.where(PurchaseProposal.status == status_filter.value)
    stmt = stmt.order_by(PurchaseProposal.created_at.desc(), PurchaseProposal.id.desc())
    proposals = list(db.execute(stmt).scalars().all())
    return [_to_proposal_response(db, p) for p in proposals]


def get_proposal(db: Session, proposal_id: int) -> PurchaseProposalResponse:
    """Retrieve a single purchase proposal by ID."""
    proposal = db.execute(
        select(PurchaseProposal).where(PurchaseProposal.id == proposal_id)
    ).scalar_one_or_none()
    if proposal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase proposal {proposal_id} not found.",
        )
    return _to_proposal_response(db, proposal)


def submit_proposal_for_approval(
    db: Session,
    proposal_id: int,
    *,
    expected_version: int,
    actor: ActorContext,
    notes: str | None = None,
) -> PurchaseProposalResponse:
    """Transition a DRAFT proposal to PENDING_APPROVAL for human review."""
    proposal = db.execute(
        select(PurchaseProposal).where(PurchaseProposal.id == proposal_id)
    ).scalar_one_or_none()
    if proposal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase proposal {proposal_id} not found.",
        )
    if proposal.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Version conflict on proposal {proposal.proposal_code}: expected {expected_version}, found {proposal.version}.",
        )
    if proposal.status != ProposalStatus.DRAFT.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Proposal {proposal.proposal_code} cannot be submitted from status '{proposal.status}'.",
        )

    proposal.status = ProposalStatus.PENDING_APPROVAL.value
    proposal.version += 1
    proposal.submitted_by = actor.actor_id
    proposal.submitted_at = datetime.now(timezone.utc)

    record_audit_log(
        db,
        entity_type="PROPOSAL",
        entity_id=proposal.proposal_code,
        action="PROPOSAL_SUBMITTED",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={"notes": notes or "", "new_version": proposal.version},
    )
    db.commit()
    db.refresh(proposal)
    return _to_proposal_response(db, proposal)


def cancel_proposal(
    db: Session,
    proposal_id: int,
    *,
    expected_version: int,
    actor: ActorContext,
    reason: str | None = None,
) -> PurchaseProposalResponse:
    """Cancel a DRAFT or PENDING_APPROVAL purchase proposal."""
    proposal = db.execute(
        select(PurchaseProposal).where(PurchaseProposal.id == proposal_id)
    ).scalar_one_or_none()
    if proposal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase proposal {proposal_id} not found.",
        )
    if proposal.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Version conflict on proposal {proposal.proposal_code}: expected {expected_version}, found {proposal.version}.",
        )
    if proposal.status not in {ProposalStatus.DRAFT.value, ProposalStatus.PENDING_APPROVAL.value}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Proposal {proposal.proposal_code} cannot be cancelled from status '{proposal.status}'.",
        )

    proposal.status = ProposalStatus.CANCELLED.value
    proposal.version += 1

    record_audit_log(
        db,
        entity_type="PROPOSAL",
        entity_id=proposal.proposal_code,
        action="PROPOSAL_CANCELLED",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={"reason": reason or "Cancelled by operator", "new_version": proposal.version},
    )
    db.commit()
    db.refresh(proposal)
    return _to_proposal_response(db, proposal)
