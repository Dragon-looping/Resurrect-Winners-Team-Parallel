"""Tests for human approval enforcement, rejection, audit history, and PO lifecycle."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.procurement.conftest import (
    ADMIN_HEADERS,
    AI_HEADERS,
    CUSTOMER_HEADERS,
    OFFICER_HEADERS,
    WAREHOUSE_HEADERS,
)


def _create_pending_proposal(client: TestClient, shortage_ref: str) -> dict:
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
    return sub


def test_unauthorized_and_ai_approvals_are_blocked(
    client: TestClient,
    shortage_scenario: dict[str, object],
) -> None:
    """AI_SYSTEM, WAREHOUSE_MANAGER, and CUSTOMER must be blocked from approving proposals."""
    prop = _create_pending_proposal(client, str(shortage_scenario["shortage_ref"]))

    for headers in (AI_HEADERS, WAREHOUSE_HEADERS, CUSTOMER_HEADERS):
        resp = client.post(
            f"/procurement/proposals/{prop['id']}/approve",
            headers=headers,
            json={"expected_version": prop["version"]},
        )
        assert resp.status_code == 403


def test_rejection_requires_mandatory_reason_and_logs_audit(
    client: TestClient,
    shortage_scenario: dict[str, object],
) -> None:
    """Rejecting requires a non-blank reason and records full audit history."""
    prop = _create_pending_proposal(client, str(shortage_scenario["shortage_ref"]))

    bad_resp = client.post(
        f"/procurement/proposals/{prop['id']}/reject",
        headers=OFFICER_HEADERS,
        json={"expected_version": prop["version"], "reason": "   "},
    )
    assert bad_resp.status_code == 422

    rej_resp = client.post(
        f"/procurement/proposals/{prop['id']}/reject",
        headers=OFFICER_HEADERS,
        json={"expected_version": prop["version"], "reason": "Unit price exceeds regional cap"},
    )
    assert rej_resp.status_code == 200
    rejected = rej_resp.json()
    assert rejected["status"] == "REJECTED"
    assert rejected["rejection_reason"] == "Unit price exceeds regional cap"

    hist_resp = client.get(
        f"/procurement/proposals/{prop['id']}/history",
        headers=OFFICER_HEADERS,
    )
    assert hist_resp.status_code == 200
    actions = [h["action"] for h in hist_resp.json()]
    assert actions == ["PROPOSAL_GENERATED", "PROPOSAL_SUBMITTED", "PROPOSAL_REJECTED"]


def test_approve_prevents_race_condition_and_generates_single_po(
    client: TestClient,
    shortage_scenario: dict[str, object],
) -> None:
    """Human approval prevents duplicate approvals/POs and validates PO lifecycle."""
    prop = _create_pending_proposal(client, str(shortage_scenario["shortage_ref"]))

    # Cannot create PO before approval
    early_po = client.post(
        "/procurement/purchase-orders",
        headers=OFFICER_HEADERS,
        json={"proposal_id": prop["id"]},
    )
    assert early_po.status_code == 409

    # Human approval succeeds
    app_resp = client.post(
        f"/procurement/proposals/{prop['id']}/approve",
        headers=ADMIN_HEADERS,
        json={"expected_version": prop["version"], "approval_notes": "Approved for urgent dispatch"},
    )
    assert app_resp.status_code == 200
    approved = app_resp.json()
    assert approved["status"] == "APPROVED"
    assert approved["approved_by"] == ADMIN_HEADERS["X-Actor-Id"]

    # Stale version / duplicate approval attempt is blocked with 409
    dup_app = client.post(
        f"/procurement/proposals/{prop['id']}/approve",
        headers=OFFICER_HEADERS,
        json={"expected_version": prop["version"]},
    )
    assert dup_app.status_code == 409

    # Generate PO from approved proposal
    po_resp = client.post(
        "/procurement/purchase-orders",
        headers=OFFICER_HEADERS,
        json={"proposal_id": prop["id"], "delivery_notes": "Gate 1"},
    )
    assert po_resp.status_code == 201
    po = po_resp.json()
    assert po["po_number"].startswith("PO-")
    assert po["status"] == "CREATED"
    assert po["approved_by"] == ADMIN_HEADERS["X-Actor-Id"]

    # Duplicate PO creation must be rejected
    dup_po = client.post(
        "/procurement/purchase-orders",
        headers=OFFICER_HEADERS,
        json={"proposal_id": prop["id"]},
    )
    assert dup_po.status_code == 409

    # PO lifecycle transition: CREATED -> READY_TO_SEND -> SENT -> ACKNOWLEDGED -> FULFILLED
    for next_status in ("READY_TO_SEND", "SENT", "ACKNOWLEDGED", "FULFILLED"):
        tr = client.post(
            f"/procurement/purchase-orders/{po['id']}/status",
            headers=OFFICER_HEADERS,
            json={"target_status": next_status, "expected_version": po["version"]},
        )
        assert tr.status_code == 200
        po = tr.json()
        assert po["status"] == next_status

    # Transition from terminal FULFILLED is blocked
    bad_tr = client.post(
        f"/procurement/purchase-orders/{po['id']}/status",
        headers=OFFICER_HEADERS,
        json={"target_status": "CANCELLED", "expected_version": po["version"]},
    )
    assert bad_tr.status_code == 409
