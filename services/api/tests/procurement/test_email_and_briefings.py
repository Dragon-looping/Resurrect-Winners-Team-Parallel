"""Tests for supplier email preview, human confirmation, SMTP outcomes, and role briefings."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.procurement.auth import ActorContext
from app.procurement.config import EmailIntegrationConfig
from app.procurement.email_service import send_confirmed_supplier_email
from app.models.enums import ProcurementRole
from tests.procurement.conftest import (
    ADMIN_HEADERS,
    AI_HEADERS,
    OFFICER_HEADERS,
    WAREHOUSE_HEADERS,
)


def _create_po(client: TestClient, shortage_ref: str) -> dict:
    gen = client.post(
        "/procurement/proposals/generate",
        headers=OFFICER_HEADERS,
        json={"shortage_ref": shortage_ref},
    ).json()
    sub = client.post(
        f"/procurement/proposals/{gen['id']}/submit",
        headers=OFFICER_HEADERS,
        json={"expected_version": gen["version"]},
    ).json()
    app = client.post(
        f"/procurement/proposals/{sub['id']}/approve",
        headers=OFFICER_HEADERS,
        json={"expected_version": sub["version"]},
    ).json()
    return client.post(
        "/procurement/purchase-orders",
        headers=OFFICER_HEADERS,
        json={"proposal_id": app["id"]},
    ).json()


def test_email_preview_and_human_confirmation_enforcement(
    client: TestClient,
    shortage_scenario: dict[str, object],
    monkeypatch,
) -> None:
    """Preview works without SMTP; unconfirmed send is blocked; unconfigured send does not fake SENT."""
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_FROM_EMAIL", raising=False)

    po = _create_po(client, str(shortage_scenario["shortage_ref"]))

    prev = client.post(
        f"/procurement/purchase-orders/{po['id']}/email/preview",
        headers=OFFICER_HEADERS,
    )
    assert prev.status_code == 200
    preview_data = prev.json()
    assert preview_data["po_number"] == po["po_number"]
    assert preview_data["integration_status"] == "NOT_CONFIGURED"
    assert preview_data["requires_human_confirmation"] is True

    # Sending without human_confirmed=true must fail
    unconfirmed = client.post(
        f"/procurement/purchase-orders/{po['id']}/email/send",
        headers=OFFICER_HEADERS,
        json={"human_confirmed": False},
    )
    assert unconfirmed.status_code == 422

    # Confirmed send without SMTP credentials honestly records SIMULATED_UNCONFIGURED
    unconfigured_send = client.post(
        f"/procurement/purchase-orders/{po['id']}/email/send",
        headers=OFFICER_HEADERS,
        json={"human_confirmed": True},
    )
    assert unconfigured_send.status_code == 200
    log = unconfigured_send.json()
    assert log["delivery_status"] == "SIMULATED_UNCONFIGURED"
    assert log["integration_status"] == "NOT_CONFIGURED"


def test_email_send_configured_success_and_failure(
    db_session: Session,
    client: TestClient,
    shortage_scenario: dict[str, object],
) -> None:
    """Configured SMTP records SENT on success and FAILED on transport error."""
    po = _create_po(client, str(shortage_scenario["shortage_ref"]))
    actor = ActorContext(actor_id="ananya.rao", role=ProcurementRole.PROCUREMENT_OFFICER)
    cfg = EmailIntegrationConfig(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_username="user",
        smtp_password="secret",
        smtp_from_email="procurement@setuvyuha.example.com",
        smtp_use_tls=True,
    )

    def _failing_sender(_cfg, _msg):
        raise ConnectionError("SMTP relay unreachable")

    failed_log = send_confirmed_supplier_email(
        db_session,
        po["id"],
        actor,
        human_confirmed=True,
        email_config=cfg,
        smtp_sender=_failing_sender,
    )
    assert failed_log.delivery_status == "FAILED"
    assert "SMTP relay unreachable" in (failed_log.error_message or "")

    sent_log = send_confirmed_supplier_email(
        db_session,
        po["id"],
        actor,
        human_confirmed=True,
        email_config=cfg,
        smtp_sender=lambda _cfg, _msg: "msg-test-123",
    )
    assert sent_log.delivery_status == "SENT"
    assert sent_log.provider_message_id == "msg-test-123"


def test_role_specific_briefings_and_permissions(
    client: TestClient,
    shortage_scenario: dict[str, object],
) -> None:
    """Briefings enforce role permissions and return grounded operational data."""
    # Warehouse manager can view WAREHOUSE_MANAGER briefing
    wh_ok = client.post(
        "/procurement/briefings",
        headers=WAREHOUSE_HEADERS,
        json={"target_role": "WAREHOUSE_MANAGER"},
    )
    assert wh_ok.status_code == 200
    wh_data = wh_ok.json()
    assert wh_data["role"] == "WAREHOUSE_MANAGER"
    assert wh_data["metrics_snapshot"]["active_shortages"] == 1
    assert wh_data["executive_summary"]
    assert len(wh_data["priority_ranked_issues"]) >= 1

    # Warehouse manager cannot view PROCUREMENT_OFFICER or ADMINISTRATOR briefings
    wh_forbidden = client.post(
        "/procurement/briefings",
        headers=WAREHOUSE_HEADERS,
        json={"target_role": "PROCUREMENT_OFFICER"},
    )
    assert wh_forbidden.status_code == 403

    # AI_SYSTEM cannot access briefings
    ai_forbidden = client.post(
        "/procurement/briefings",
        headers=AI_HEADERS,
        json={"target_role": "ADMINISTRATOR"},
    )
    assert ai_forbidden.status_code == 403

    # Administrator can view ADMINISTRATOR and PROCUREMENT_OFFICER briefings
    admin_ok = client.post(
        "/procurement/briefings",
        headers=ADMIN_HEADERS,
        json={"target_role": "ADMINISTRATOR"},
    )
    assert admin_ok.status_code == 200
    assert admin_ok.json()["role"] == "ADMINISTRATOR"
