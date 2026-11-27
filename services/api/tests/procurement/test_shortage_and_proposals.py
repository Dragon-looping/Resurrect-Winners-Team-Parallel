"""Tests for shortage integration, AI proposal generation, and duplicate prevention."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.procurement.conftest import OFFICER_HEADERS


def test_shortage_integration_lists_live_shortages(
    client: TestClient,
    shortage_scenario: dict[str, object],
) -> None:
    """Shortage endpoint reuses fulfilment risk engine and returns enriched shortage alerts."""
    resp = client.get("/procurement/shortages", headers=OFFICER_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    alert = data[0]
    assert alert["shortage_ref"] == shortage_scenario["shortage_ref"]
    assert alert["shortage_quantity"] == 60
    assert alert["required_quantity"] == 60
    assert alert["available_quantity"] == 0
    assert alert["urgency_level"] == "CRITICAL"
    assert alert["has_active_proposal"] is False
    assert "Procurement" in alert["affected_departments"]


def test_generate_proposal_and_prevent_duplicate(
    client: TestClient,
    shortage_scenario: dict[str, object],
) -> None:
    """Generating a proposal integrates Branch 1 & 2 and prevents duplicate active proposals."""
    shortage_ref = shortage_scenario["shortage_ref"]
    gen_resp = client.post(
        "/procurement/proposals/generate",
        headers=OFFICER_HEADERS,
        json={"shortage_ref": shortage_ref, "delivery_notes": "Bay 2 urgent unload"},
    )
    assert gen_resp.status_code == 201
    prop = gen_resp.json()

    assert prop["shortage_ref"] == shortage_ref
    assert prop["status"] == "DRAFT"
    assert prop["recommended_quantity"] == 60
    assert prop["estimated_total_price"] == round(prop["estimated_unit_price"] * 60, 2)
    assert prop["preferred_supplier"]["supplier_code"]
    assert len(prop["alternative_suppliers"]) >= 1
    assert len(prop["historical_case_refs"]) >= 1
    assert prop["ai_justification"]
    assert prop["ai_grounding_notes"]["verified_facts"]["shortage_quantity"] == 60
    assert prop["ai_grounding_notes"]["ai_suggestions"]["human_approval_required"] is True

    # Shortage now reports active proposal
    shortage_resp = client.get("/procurement/shortages", headers=OFFICER_HEADERS)
    assert shortage_resp.status_code == 200
    assert shortage_resp.json()[0]["has_active_proposal"] is True

    # Duplicate active proposal must be rejected with 409 Conflict
    dup_resp = client.post(
        "/procurement/proposals/generate",
        headers=OFFICER_HEADERS,
        json={"shortage_ref": shortage_ref},
    )
    assert dup_resp.status_code == 409


def test_submit_proposal_for_approval(
    client: TestClient,
    shortage_scenario: dict[str, object],
) -> None:
    """Submitting a DRAFT proposal moves it to PENDING_APPROVAL and into the approval queue."""
    gen_resp = client.post(
        "/procurement/proposals/generate",
        headers=OFFICER_HEADERS,
        json={"shortage_ref": shortage_scenario["shortage_ref"]},
    )
    prop = gen_resp.json()

    submit_resp = client.post(
        f"/procurement/proposals/{prop['id']}/submit",
        headers=OFFICER_HEADERS,
        json={"expected_version": prop["version"], "notes": "Ready for officer sign-off"},
    )
    assert submit_resp.status_code == 200
    submitted = submit_resp.json()
    assert submitted["status"] == "PENDING_APPROVAL"
    assert submitted["version"] == prop["version"] + 1

    queue_resp = client.get("/procurement/approvals/queue", headers=OFFICER_HEADERS)
    assert queue_resp.status_code == 200
    assert any(item["id"] == prop["id"] for item in queue_resp.json())
