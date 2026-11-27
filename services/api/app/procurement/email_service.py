"""Supplier Purchase Order email preview and human-confirmed dispatch workflow."""

from __future__ import annotations

from datetime import datetime, timezone
from email.message import EmailMessage
import html
import smtplib
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Plant, SKU
from app.models.enums import EmailDeliveryStatus, PurchaseOrderStatus
from app.models.procurement import PurchaseOrder, Supplier, SupplierEmailLog
from app.procurement.audit import record_audit_log
from app.procurement.auth import ActorContext, require_human_approver
from app.procurement.config import EmailIntegrationConfig, get_email_config
from app.procurement.schemas import EmailLogResponse, EmailPreviewResponse


def _load_po_context(
    db: Session, po_id: int
) -> tuple[PurchaseOrder, Supplier, Plant, SKU]:
    po = db.execute(select(PurchaseOrder).where(PurchaseOrder.id == po_id)).scalar_one_or_none()
    if po is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase Order {po_id} not found.",
        )
    supplier = db.execute(select(Supplier).where(Supplier.id == po.supplier_id)).scalar_one()
    plant = db.execute(select(Plant).where(Plant.id == po.plant_id)).scalar_one()
    sku = db.execute(select(SKU).where(SKU.id == po.sku_id)).scalar_one()
    if not supplier.contact_email or "@" not in supplier.contact_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Supplier '{supplier.name}' does not have a verified contact email.",
        )
    return po, supplier, plant, sku


def _compose_po_email(
    po: PurchaseOrder,
    supplier: Supplier,
    plant: Plant,
    sku: SKU,
    *,
    custom_note: str | None = None,
) -> tuple[str, str, str]:
    """Compose subject, plain-text body, and HTML body from verified PO records."""
    subject = f"Purchase Order {po.po_number} — {sku.sku_code} ({po.approved_quantity} {sku.unit}) — SETUVYUHA"
    delivery_notes = (po.delivery_info or {}).get("delivery_notes", "Standard dock receiving")
    target_date = (po.delivery_info or {}).get("target_delivery_date", "As per agreed lead time")
    note_block = f"\nAdditional Instructions:\n{custom_note.strip()}\n" if custom_note and custom_note.strip() else ""

    body_text = (
        f"Dear {supplier.contact_name},\n\n"
        f"Please find below official Purchase Order {po.po_number} issued by SETUVYUHA Procurement "
        f"(Approval Ref: {po.approval_reference}, Approved By: {po.approved_by}).\n\n"
        f"PURCHASE ORDER SUMMARY\n"
        f"----------------------\n"
        f"PO Number:        {po.po_number}\n"
        f"Supplier:         {supplier.name} ({supplier.supplier_code})\n"
        f"Item / SKU:       {sku.name} ({sku.sku_code})\n"
        f"Approved Qty:     {po.approved_quantity} {sku.unit}\n"
        f"Unit Price:       {po.currency} {po.unit_price:,.2f}\n"
        f"Total Amount:     {po.currency} {po.total_amount:,.2f}\n"
        f"Delivery Plant:   {plant.name} — {plant.location}\n"
        f"Target Delivery:  {target_date}\n"
        f"Receiving Notes:  {delivery_notes}\n"
        f"{note_block}\n"
        f"Please reply to confirm receipt and expected dispatch schedule.\n\n"
        f"Regards,\n"
        f"SETUVYUHA Procurement Operations\n"
    )

    escaped_note = (
        f"<p><strong>Additional Instructions:</strong> {html.escape(custom_note.strip())}</p>"
        if custom_note and custom_note.strip()
        else ""
    )
    body_html = (
        f"<html><body style='font-family:Inter,Arial,sans-serif;color:#18181b;'>"
        f"<p>Dear {html.escape(supplier.contact_name)},</p>"
        f"<p>Please find below official Purchase Order <strong>{html.escape(po.po_number)}</strong> "
        f"(Approval Ref: <code>{html.escape(po.approval_reference)}</code>, Approved By: {html.escape(po.approved_by)}).</p>"
        f"<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;border-color:#d4d4d8;'>"
        f"<tr><th align='left'>PO Number</th><td>{html.escape(po.po_number)}</td></tr>"
        f"<tr><th align='left'>Item / SKU</th><td>{html.escape(sku.name)} ({html.escape(sku.sku_code)})</td></tr>"
        f"<tr><th align='left'>Approved Qty</th><td>{po.approved_quantity} {html.escape(sku.unit)}</td></tr>"
        f"<tr><th align='left'>Unit Price</th><td>{html.escape(po.currency)} {po.unit_price:,.2f}</td></tr>"
        f"<tr><th align='left'>Total Amount</th><td><strong>{html.escape(po.currency)} {po.total_amount:,.2f}</strong></td></tr>"
        f"<tr><th align='left'>Delivery Plant</th><td>{html.escape(plant.name)} — {html.escape(plant.location)}</td></tr>"
        f"<tr><th align='left'>Target Delivery</th><td>{html.escape(str(target_date))}</td></tr>"
        f"</table>"
        f"{escaped_note}"
        f"<p>Please reply to confirm receipt and expected dispatch schedule.</p>"
        f"<p>Regards,<br/>SETUVYUHA Procurement Operations</p>"
        f"</body></html>"
    )
    return subject, body_text, body_html


def preview_supplier_email(
    db: Session,
    po_id: int,
    actor: ActorContext,
    *,
    custom_note: str | None = None,
    email_config: EmailIntegrationConfig | None = None,
) -> EmailPreviewResponse:
    """Generate and record a supplier PO email preview without sending."""
    po, supplier, plant, sku = _load_po_context(db, po_id)
    cfg = email_config or get_email_config()
    integration_status = "CONFIGURED" if cfg.is_configured else "NOT_CONFIGURED"

    subject, body_text, body_html = _compose_po_email(
        po, supplier, plant, sku, custom_note=custom_note
    )
    now_utc = datetime.now(timezone.utc)

    log_entry = SupplierEmailLog(
        purchase_order_id=po.id,
        recipient_email=supplier.contact_email,
        recipient_name=supplier.contact_name,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        integration_status=integration_status,
        delivery_status=EmailDeliveryStatus.PREVIEWED.value,
    )
    db.add(log_entry)
    record_audit_log(
        db,
        entity_type="EMAIL",
        entity_id=po.po_number,
        action="EMAIL_PREVIEWED",
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        details={
            "recipient_email": supplier.contact_email,
            "integration_status": integration_status,
        },
    )
    db.commit()

    return EmailPreviewResponse(
        purchase_order_id=po.id,
        po_number=po.po_number,
        recipient_name=supplier.contact_name,
        recipient_email=supplier.contact_email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        integration_status=integration_status,
        smtp_host_configured=cfg.is_configured,
        requires_human_confirmation=True,
        previewed_at=now_utc,
    )


def _default_smtp_send(cfg: EmailIntegrationConfig, message: EmailMessage) -> str:
    """Send an EmailMessage synchronously over configured SMTP server."""
    assert cfg.smtp_host is not None
    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=10) as client:
        if cfg.smtp_use_tls:
            client.starttls()
        if cfg.smtp_username and cfg.smtp_password:
            client.login(cfg.smtp_username, cfg.smtp_password)
        client.send_message(message)
    return f"smtp-{uuid4().hex[:12]}"


def send_confirmed_supplier_email(
    db: Session,
    po_id: int,
    actor: ActorContext,
    *,
    human_confirmed: bool,
    custom_note: str | None = None,
    email_config: EmailIntegrationConfig | None = None,
    smtp_sender=None,
) -> EmailLogResponse:
    """Send a supplier PO email ONLY after explicit human confirmation."""
    require_human_approver(actor)

    if not human_confirmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Explicit human_confirmed=true is required before dispatching supplier emails.",
        )

    po, supplier, plant, sku = _load_po_context(db, po_id)
    if po.status == PurchaseOrderStatus.CANCELLED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot send email for cancelled Purchase Order {po.po_number}.",
        )

    cfg = email_config or get_email_config()
    subject, body_text, body_html = _compose_po_email(
        po, supplier, plant, sku, custom_note=custom_note
    )
    now_utc = datetime.now(timezone.utc)

    if not cfg.is_configured:
        log_entry = SupplierEmailLog(
            purchase_order_id=po.id,
            recipient_email=supplier.contact_email,
            recipient_name=supplier.contact_name,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            integration_status="NOT_CONFIGURED",
            delivery_status=EmailDeliveryStatus.SIMULATED_UNCONFIGURED.value,
            confirmed_by=actor.actor_id,
            confirmed_at=now_utc,
            error_message=(
                "SMTP credentials (SMTP_HOST / SMTP_FROM_EMAIL) are not configured. "
                "Email was NOT sent; use the preview to copy or download."
            ),
        )
        db.add(log_entry)
        record_audit_log(
            db,
            entity_type="EMAIL",
            entity_id=po.po_number,
            action="EMAIL_SKIPPED_UNCONFIGURED",
            actor_id=actor.actor_id,
            actor_role=actor.role.value,
            details={"recipient_email": supplier.contact_email},
        )
        db.commit()
        db.refresh(log_entry)
        return EmailLogResponse.model_validate(log_entry, from_attributes=True)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg.smtp_from_email
    msg["To"] = supplier.contact_email
    msg.set_content(body_text)
    msg.add_alternative(body_html, subtype="html")

    sender_fn = smtp_sender or _default_smtp_send
    try:
        message_id = sender_fn(cfg, msg)
        log_entry = SupplierEmailLog(
            purchase_order_id=po.id,
            recipient_email=supplier.contact_email,
            recipient_name=supplier.contact_name,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            integration_status="CONFIGURED",
            delivery_status=EmailDeliveryStatus.SENT.value,
            confirmed_by=actor.actor_id,
            confirmed_at=now_utc,
            sent_at=datetime.now(timezone.utc),
            provider_message_id=message_id,
        )
        db.add(log_entry)
        if po.status in {PurchaseOrderStatus.CREATED.value, PurchaseOrderStatus.READY_TO_SEND.value}:
            po.status = PurchaseOrderStatus.SENT.value
            po.version += 1
        record_audit_log(
            db,
            entity_type="EMAIL",
            entity_id=po.po_number,
            action="EMAIL_SENT",
            actor_id=actor.actor_id,
            actor_role=actor.role.value,
            details={
                "recipient_email": supplier.contact_email,
                "provider_message_id": message_id,
            },
        )
        db.commit()
        db.refresh(log_entry)
        return EmailLogResponse.model_validate(log_entry, from_attributes=True)
    except Exception as exc:
        log_entry = SupplierEmailLog(
            purchase_order_id=po.id,
            recipient_email=supplier.contact_email,
            recipient_name=supplier.contact_name,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            integration_status="CONFIGURED",
            delivery_status=EmailDeliveryStatus.FAILED.value,
            confirmed_by=actor.actor_id,
            confirmed_at=now_utc,
            error_message=str(exc),
        )
        db.add(log_entry)
        record_audit_log(
            db,
            entity_type="EMAIL",
            entity_id=po.po_number,
            action="EMAIL_FAILED",
            actor_id=actor.actor_id,
            actor_role=actor.role.value,
            details={"recipient_email": supplier.contact_email, "error": str(exc)},
        )
        db.commit()
        db.refresh(log_entry)
        return EmailLogResponse.model_validate(log_entry, from_attributes=True)


def list_email_logs(
    db: Session,
    *,
    po_id: int | None = None,
) -> list[EmailLogResponse]:
    """List supplier email delivery logs ordered newest-first."""
    stmt = select(SupplierEmailLog)
    if po_id is not None:
        stmt = stmt.where(SupplierEmailLog.purchase_order_id == po_id)
    stmt = stmt.order_by(SupplierEmailLog.created_at.desc(), SupplierEmailLog.id.desc())
    rows = list(db.execute(stmt).scalars().all())
    return [EmailLogResponse.model_validate(r, from_attributes=True) for r in rows]
