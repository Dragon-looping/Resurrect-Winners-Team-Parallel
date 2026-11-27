"""Transaction-safe Purchase Order generation from approved proposals."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Plant, SKU
from app.models.enums import ProposalStatus, PurchaseOrderStatus
from app.models.procurement import PurchaseOrder, PurchaseProposal, Supplier
from app.procurement.audit import record_audit_log
from app.procurement.auth import ActorContext, require_human_approver
from app.procurement.schemas import PurchaseOrderCreateRequest, PurchaseOrderResponse


def _to_po_response(db: Session, po: PurchaseOrder) -> PurchaseOrderResponse:
    proposal = db.execute(
        select(PurchaseProposal).where(PurchaseProposal.id == po.proposal_id)
    ).scalar_one()
    supplier = db.execute(select(Supplier).where(Supplier.id == po.supplier_id)).scalar_one()
    plant = db.execute(select(Plant).where(Plant.id == po.plant_id)).scalar_one()
    sku = db.execute(select(SKU).where(SKU.id == po.sku_id)).scalar_one()

    return PurchaseOrderResponse(
        id=po.id,
        po_number=po.po_number,
        proposal_id=po.proposal_id,
        proposal_code=proposal.proposal_code,
        supplier_id=po.supplier_id,
        supplier_code=supplier.supplier_code,
        supplier_name=supplier.name,
        supplier_email=supplier.contact_email,
        plant_id=po.plant_id,
        plant_name=plant.name,
        sku_id=po.sku_id,
        sku_code=sku.sku_code,
        sku_name=sku.name,
        unit=sku.unit,
        approved_quantity=po.approved_quantity,
        unit_price=po.unit_price,
        total_amount=po.total_amount,
        currency=po.currency,
        delivery_info=po.delivery_info,
        approval_reference=po.approval_reference,
        approved_by=po.approved_by,
        status=PurchaseOrderStatus(po.status),
        version=po.version,
        created_at=po.created_at,
        updated_at=po.updated_at,
    )


def create_purchase_order_from_proposal(
    db: Session,
    payload: PurchaseOrderCreateRequest,
    actor: ActorContext,
) -> PurchaseOrderResponse:
    """Create a Purchase Order strictly from an APPROVED PurchaseProposal."""
    require_human_approver(actor)

    proposal = db.execute(
        select(PurchaseProposal).where(PurchaseProposal.id == payload.proposal_id)
    ).scalar_one_or_none()
    if proposal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase proposal {payload.proposal_id} not found.",
        )

    existing_po = db.execute(
        select(PurchaseOrder).where(PurchaseOrder.proposal_id == proposal.id)
    ).scalar_one_or_none()
    if existing_po is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Purchase Order {existing_po.po_number} has already been created for "
                f"proposal {proposal.proposal_code}."
            ),
        )

    if proposal.status != ProposalStatus.APPROVED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Proposal {proposal.proposal_code} is in status '{proposal.status}'. "
                "Purchase orders can only be generated from APPROVED proposals."
            ),
        )

    if not proposal.approved_by:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Proposal is missing verified human approver identity.",
        )

    po_number = f"PO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
    delivery_info = dict(proposal.delivery_requirements or {})
    if payload.delivery_notes:
        delivery_info["po_delivery_notes"] = payload.delivery_notes

    approval_ref = (
        f"APR-{proposal.proposal_code}-"
        f"{proposal.approved_at.strftime('%Y%m%d%H%M') if proposal.approved_at else 'VERIFIED'}"
    )

    total_amount = round(proposal.recommended_quantity * proposal.estimated_unit_price, 2)
    po = PurchaseOrder(
        po_number=po_number,
        proposal_id=proposal.id,
        supplier_id=proposal.preferred_supplier_id,
        plant_id=proposal.plant_id,
        sku_id=proposal.sku_id,
        approved_quantity=proposal.recommended_quantity,
        unit_price=proposal.estimated_unit_price,
        total_amount=total_amount,
        currency=proposal.currency,
        delivery_info=delivery_info,
        approval_reference=approval_ref,
        approved_by=proposal.approved_by,
        status=PurchaseOrderStatus.CREATED.value,
        version=1,
    )
    db.add(po)
    proposal.status = ProposalStatus.ORDER_CREATED.value
    proposal.version += 1

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Duplicate Purchase Order prevented for proposal {proposal.proposal_code}.",
        ) from exc

    record_audit_log(
        db,
        entity_type="PURCHASE_ORDER",
        entity_id=po.po_number,
        action="PO_CREATED",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={
            "proposal_code": proposal.proposal_code,
            "approved_by": proposal.approved_by,
            "approved_quantity": po.approved_quantity,
            "total_amount": po.total_amount,
        },
    )
    db.commit()
    db.refresh(po)
    return _to_po_response(db, po)


ALLOWED_PO_TRANSITIONS: dict[PurchaseOrderStatus, frozenset[PurchaseOrderStatus]] = {
    PurchaseOrderStatus.CREATED: frozenset(
        {PurchaseOrderStatus.READY_TO_SEND, PurchaseOrderStatus.SENT, PurchaseOrderStatus.CANCELLED}
    ),
    PurchaseOrderStatus.READY_TO_SEND: frozenset(
        {PurchaseOrderStatus.SENT, PurchaseOrderStatus.CANCELLED}
    ),
    PurchaseOrderStatus.SENT: frozenset(
        {PurchaseOrderStatus.ACKNOWLEDGED, PurchaseOrderStatus.CANCELLED}
    ),
    PurchaseOrderStatus.ACKNOWLEDGED: frozenset(
        {PurchaseOrderStatus.FULFILLED, PurchaseOrderStatus.CANCELLED}
    ),
    PurchaseOrderStatus.FULFILLED: frozenset(),
    PurchaseOrderStatus.CANCELLED: frozenset(),
}


def list_purchase_orders(
    db: Session,
    *,
    status_filter: PurchaseOrderStatus | None = None,
) -> list[PurchaseOrderResponse]:
    """List purchase orders ordered newest-first, optionally filtered by status."""
    stmt = select(PurchaseOrder)
    if status_filter is not None:
        stmt = stmt.where(PurchaseOrder.status == status_filter.value)
    stmt = stmt.order_by(PurchaseOrder.created_at.desc(), PurchaseOrder.id.desc())
    rows = list(db.execute(stmt).scalars().all())
    return [_to_po_response(db, po) for po in rows]


def get_purchase_order(db: Session, po_id: int) -> PurchaseOrderResponse:
    """Retrieve a single purchase order by ID."""
    po = db.execute(select(PurchaseOrder).where(PurchaseOrder.id == po_id)).scalar_one_or_none()
    if po is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase Order {po_id} not found.",
        )
    return _to_po_response(db, po)


def transition_po_status(
    db: Session,
    po_id: int,
    *,
    target_status: PurchaseOrderStatus,
    expected_version: int,
    actor: ActorContext,
    notes: str | None = None,
) -> PurchaseOrderResponse:
    """Validate and apply a Purchase Order status transition with audit trail."""
    require_human_approver(actor)

    po = db.execute(select(PurchaseOrder).where(PurchaseOrder.id == po_id)).scalar_one_or_none()
    if po is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase Order {po_id} not found.",
        )
    if po.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Version conflict on {po.po_number}: expected {expected_version}, found {po.version}.",
        )

    current_status = PurchaseOrderStatus(po.status)
    allowed_next = ALLOWED_PO_TRANSITIONS.get(current_status, frozenset())
    if target_status not in allowed_next:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invalid PO transition from '{current_status.value}' to '{target_status.value}'.",
        )

    po.status = target_status.value
    po.version += 1

    record_audit_log(
        db,
        entity_type="PURCHASE_ORDER",
        entity_id=po.po_number,
        action="PO_STATUS_UPDATED",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={
            "from_status": current_status.value,
            "to_status": target_status.value,
            "notes": notes or "",
            "new_version": po.version,
        },
    )
    db.commit()
    db.refresh(po)
    return _to_po_response(db, po)
