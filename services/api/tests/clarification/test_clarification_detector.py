"""Tests for deterministic ambiguity detection and POST /clarify API (PS6)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.clarification.detector import AmbiguityDetectorService
from app.clarification.schemas import ClarificationRequest
from app.main import app


def test_complete_request_does_not_require_clarification():
    detector = AmbiguityDetectorService()
    resp = detector.analyze(
        ClarificationRequest(
            request_text=(
                "Send 50 FAN-HV-24-IND industrial fans to Manipal Commercial Center "
                "for arrival at receiving dock by 2026-11-27, split delivery ok."
            )
        )
    )

    assert resp.clarification_required is False
    assert resp.can_proceed is True
    assert resp.missing_required_fields == []
    assert resp.conflicts == []
    assert resp.questions == []
    assert resp.extracted_context["sku"] == "FAN-HV-24-IND"
    assert resp.extracted_context["quantity"] == 50
    assert "Manipal" in resp.extracted_context["destination"]


def test_missing_essential_fields_generates_minimal_targeted_questions():
    detector = AmbiguityDetectorService()
    # Supply product and quantity, omit destination and date
    resp = detector.analyze(
        ClarificationRequest(request_text="Need 20 submersible pumps")
    )

    assert resp.clarification_required is True
    assert resp.can_proceed is False
    assert "destination" in resp.missing_required_fields
    assert "requested_date" in resp.missing_required_fields
    assert "product_or_sku" not in resp.missing_required_fields
    assert "quantity" not in resp.missing_required_fields

    asked_fields = {q.field for q in resp.questions}
    assert asked_fields == {"destination", "requested_date"}
    assert all(d.is_suggestion is True for d in resp.safe_defaults)


def test_already_supplied_context_prevents_redundant_questions():
    detector = AmbiguityDetectorService()
    resp = detector.analyze(
        ClarificationRequest(
            request_text="Send 50 fans",
            destination="Manipal Commercial Center",
            requested_date="2026-11-27",
            date_meaning="arrival",
        )
    )

    assert resp.clarification_required is False
    assert resp.can_proceed is True
    assert resp.questions == []


def test_conflicting_requirements_are_detected_and_prioritized():
    detector = AmbiguityDetectorService()
    resp = detector.analyze(
        ClarificationRequest(
            request_text=(
                "Deliver 50 fans to Manipal by 2026-11-27 arrival at dock, "
                "must arrive all together in a single load, split delivery ok."
            )
        )
    )

    assert resp.clarification_required is True
    assert resp.can_proceed is False
    assert any(c.conflict_type == "delivery_mode_conflict" for c in resp.conflicts)
    assert resp.questions[0].field == "must_arrive_together"
    assert any(d.is_suggestion is True for d in resp.safe_defaults)


def test_date_meaning_ambiguity_asks_arrival_vs_dispatch():
    detector = AmbiguityDetectorService()
    resp = detector.analyze(
        ClarificationRequest(
            request_text="Send 50 industrial fans to Manipal by Friday"
        )
    )

    assert resp.clarification_required is True
    assert "date_meaning" in resp.missing_required_fields
    assert len(resp.questions) == 1
    assert resp.questions[0].field == "date_meaning"
    assert len(resp.questions[0].options) == 2


def test_vague_intent_and_empty_request_handled_cleanly():
    detector = AmbiguityDetectorService()
    resp = detector.analyze(ClarificationRequest(request_text="Send some items soon"))

    assert resp.clarification_required is True
    assert resp.can_proceed is False
    assert len(resp.questions) <= 4
    assert "product_or_sku" in resp.missing_required_fields


def test_clarify_api_endpoint_and_p3_backward_compatibility():
    client = TestClient(app)

    # 1. Standard PS6 request
    res = client.post(
        "/clarify",
        json={"request_text": "Need 30 fans in Udupi"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["clarification_required"] is True
    assert body["missing_required_fields"] == ["requested_date"]

    # 2. Determinism check
    res2 = client.post(
        "/clarify",
        json={"request_text": "Need 30 fans in Udupi"},
    )
    assert res2.json() == body

    # 3. P3 inline option reply compatibility
    p3_res = client.post(
        "/clarify",
        json={
            "orderId": "ORD-2026-MANIPAL-CLARIFY",
            "questionId": "Q-DATE-MEANING-01",
            "selectedOptionId": "arrive_by_friday",
        },
    )
    assert p3_res.status_code == 200
    assert p3_res.json()["can_proceed"] is True
    assert p3_res.json()["clarification_required"] is False
