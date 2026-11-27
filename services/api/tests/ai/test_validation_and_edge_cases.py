"""Tests for ResponseValidator edge cases and schema/evidence enforcement."""

from __future__ import annotations

import json

import pytest

from app.ai.providers.base import RawProviderResult
from app.ai.schemas import (
    AuthoritativeMetrics,
    EvidenceItem,
    GatewayRequest,
    ProviderName,
    TaskType,
)
from app.ai.validator import ResponseValidator


def _raw(payload: dict | str, provider: ProviderName = ProviderName.GROQ) -> RawProviderResult:
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return RawProviderResult(
        provider=provider,
        model_id="test-model",
        raw_text=text,
        latency_ms=25.0,
    )


def test_validator_accepts_markdown_json_code_fences():
    validator = ResponseValidator()
    request = GatewayRequest(
        task_type=TaskType.SUMMARY,
        prompt="Summarize stock transfer.",
        evidence=[
            EvidenceItem(
                evidence_id="ev-1",
                source_type="stock_record",
                summary="100 units available.",
            )
        ],
    )
    fenced = '```json\n{"summary": "100 units available.", "cited_evidence_ids": ["ev-1"]}\n```'

    result = validator.validate(request, _raw(fenced))

    assert result.valid is True
    assert result.output is not None
    assert result.output.summary == "100 units available."
    assert result.output.cited_evidence_ids == ["ev-1"]


def test_validator_rejects_whitespace_only_summary():
    validator = ResponseValidator()
    request = GatewayRequest(task_type=TaskType.SUMMARY, prompt="Summarize.")

    result = validator.validate(request, _raw({"summary": "   \n\t  "}))

    assert result.valid is False
    assert any("summary" in err.lower() for err in result.errors)


def test_validator_rejects_expected_schema_type_mismatches_and_bool_for_int():
    validator = ResponseValidator()
    request = GatewayRequest(
        task_type=TaskType.STRUCTURED_ANALYSIS,
        prompt="Analyze transfer.",
        expected_schema={"unit_count": "int", "tags": "list", "route_note": "str"},
    )

    bool_as_int = validator.validate(
        request,
        _raw(
            {
                "summary": "Analysis complete.",
                "data": {"unit_count": True, "tags": ["urgent"], "route_note": "ok"},
            }
        ),
    )
    assert bool_as_int.valid is False
    assert any("unit_count" in err for err in bool_as_int.errors)

    wrong_list_type = validator.validate(
        request,
        _raw(
            {
                "summary": "Analysis complete.",
                "data": {"unit_count": 10, "tags": "urgent", "route_note": 123},
            }
        ),
    )
    assert wrong_list_type.valid is False
    assert any("tags" in err for err in wrong_list_type.errors)
    assert any("route_note" in err for err in wrong_list_type.errors)


def test_validator_rejects_negative_quantities():
    validator = ResponseValidator()
    request = GatewayRequest(task_type=TaskType.EXPLANATION, prompt="Explain stock.")

    result = validator.validate(
        request,
        _raw({"summary": "Stock check.", "quantities": {"available_qty": -5}}),
    )

    assert result.valid is False
    assert any("negative" in err.lower() for err in result.errors)


@pytest.mark.parametrize(
    "raw_json",
    [
        '{"summary": "Check", "quantities": {"qty": NaN}}',
        '{"summary": "Check", "quantities": {"qty": Infinity}}',
        '{"summary": "Check", "monetary_values": {"cost": -Infinity}}',
    ],
)
def test_validator_rejects_nan_and_infinity(raw_json: str):
    validator = ResponseValidator()
    request = GatewayRequest(task_type=TaskType.EXPLANATION, prompt="Explain cost.")

    result = validator.validate(request, _raw(raw_json))

    assert result.valid is False
    assert result.errors


@pytest.mark.parametrize(
    "payload",
    [
        {"summary": "Invented", "invented_inventory": [{"sku": "X", "qty": 50}]},
        {"summary": "Nested", "data": {"synthetic_orders": ["ORD-999"]}},
    ],
)
def test_validator_rejects_disallowed_synthetic_keys(payload: dict):
    validator = ResponseValidator()
    request = GatewayRequest(task_type=TaskType.EXPLANATION, prompt="Explain order.")

    result = validator.validate(request, _raw(payload))

    assert result.valid is False
    assert any("synthetic" in err.lower() for err in result.errors)


def test_validator_rejects_unverified_numeric_invention_when_metrics_present():
    validator = ResponseValidator()
    request = GatewayRequest(
        task_type=TaskType.EXPLANATION,
        prompt="Explain transfer.",
        authoritative_metrics=AuthoritativeMetrics(
            quantities={"transfer_qty": 120},
            monetary_amounts={"transfer_cost": 4500.0},
            currency="INR",
        ),
    )

    result = validator.validate(
        request,
        _raw(
            {
                "summary": "Transfer 120 units.",
                "quantities": {"transfer_qty": 120, "extra_hidden_qty": 30},
            }
        ),
    )

    assert result.valid is False
    assert any("extra_hidden_qty" in err for err in result.errors)
