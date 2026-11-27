"""Tests for AI Gateway routing, failover, validation, cooldowns, and fallback."""

from __future__ import annotations

from dataclasses import replace

import pytest

from app.ai.exceptions import AIProviderError, AISafetyRefusalError
from app.ai.gateway import AIGatewayService
from app.ai.providers.base import RawProviderResult
from app.ai.schemas import (
    ErrorCategory,
    ExecutionMode,
    GatewayRequest,
    ProviderName,
    TaskType,
)
from tests.ai.conftest import FakeClock, StubProviderAdapter, make_raw_json_result


def _build_gateway(
    config,
    clock: FakeClock,
    groq_outcomes: list,
    gemini_outcomes: list,
    *,
    groq_duration: float = 0.05,
    gemini_duration: float = 0.05,
) -> tuple[AIGatewayService, StubProviderAdapter, StubProviderAdapter]:
    groq_adapter = StubProviderAdapter(
        config.groq,
        outcomes=groq_outcomes,
        clock=clock,
        simulated_duration_seconds=groq_duration,
    )
    gemini_adapter = StubProviderAdapter(
        config.gemini,
        outcomes=gemini_outcomes,
        clock=clock,
        simulated_duration_seconds=gemini_duration,
    )
    gateway = AIGatewayService(
        config=config,
        adapters={
            ProviderName.GROQ: groq_adapter,
            ProviderName.GEMINI: gemini_adapter,
        },
        clock=clock,
    )
    return gateway, groq_adapter, gemini_adapter


async def test_groq_success_does_not_call_gemini(gateway_config, fake_clock, sample_request):
    gateway, groq, gemini = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[make_raw_json_result(ProviderName.GROQ)],
        gemini_outcomes=[],
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.GROQ
    assert resp.preferred_provider == ProviderName.GROQ
    assert resp.actual_provider == ProviderName.GROQ
    assert resp.model_id == "llama-test-model"
    assert resp.attempts == 1
    assert resp.fallback_used is False
    assert resp.validation_status == "passed"
    assert resp.service_status == "healthy"
    assert len(groq.calls) == 1
    assert len(gemini.calls) == 0


async def test_gemini_success_when_preferred_does_not_call_groq(
    gateway_config, fake_clock, sample_request
):
    cfg = replace(gateway_config, primary_provider=ProviderName.GEMINI)
    gateway, groq, gemini = _build_gateway(
        cfg,
        fake_clock,
        groq_outcomes=[],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.GEMINI
    assert resp.preferred_provider == ProviderName.GEMINI
    assert resp.actual_provider == ProviderName.GEMINI
    assert resp.model_id == "gemini-test-model"
    assert resp.attempts == 1
    assert resp.fallback_used is False
    assert len(gemini.calls) == 1
    assert len(groq.calls) == 0


async def test_groq_timeout_fails_over_to_gemini_once(
    gateway_config, fake_clock, sample_request
):
    gateway, groq, gemini = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[
            AIProviderError(ProviderName.GROQ, ErrorCategory.TIMEOUT, "Groq timed out.")
        ],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
        groq_duration=4.0,
        gemini_duration=0.2,
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.GEMINI
    assert resp.preferred_provider == ProviderName.GROQ
    assert resp.actual_provider == ProviderName.GEMINI
    assert resp.attempts == 2
    assert resp.fallback_used is True
    assert resp.service_status == "degraded"
    assert resp.validation_status == "passed"
    assert len(groq.calls) == 1
    assert len(gemini.calls) == 1
    assert groq.calls[0]["timeout_seconds"] == 4.0
    assert gemini.calls[0]["timeout_seconds"] == 4.0


async def test_gemini_timeout_fails_over_to_groq_once(
    gateway_config, fake_clock, sample_request
):
    cfg = replace(gateway_config, primary_provider=ProviderName.GEMINI)
    gateway, groq, gemini = _build_gateway(
        cfg,
        fake_clock,
        groq_outcomes=[make_raw_json_result(ProviderName.GROQ)],
        gemini_outcomes=[
            AIProviderError(ProviderName.GEMINI, ErrorCategory.TIMEOUT, "Gemini timed out.")
        ],
        gemini_duration=4.0,
        groq_duration=0.2,
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.GROQ
    assert resp.preferred_provider == ProviderName.GEMINI
    assert resp.actual_provider == ProviderName.GROQ
    assert resp.attempts == 2
    assert resp.fallback_used is True
    assert len(gemini.calls) == 1
    assert len(groq.calls) == 1


@pytest.mark.parametrize(
    ("category", "retry_after"),
    [
        (ErrorCategory.RATE_LIMIT, 15.0),
        (ErrorCategory.SERVER_ERROR, None),
        (ErrorCategory.CONNECTION_ERROR, None),
        (ErrorCategory.AUTHENTICATION, None),
    ],
)
async def test_groq_transient_and_auth_errors_fail_over_to_gemini(
    gateway_config, fake_clock, sample_request, category, retry_after
):
    gateway, groq, gemini = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[
            AIProviderError(
                ProviderName.GROQ,
                category,
                f"Groq failed with {category.value}",
                retry_after_seconds=retry_after,
            )
        ],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.GEMINI
    assert resp.attempts == 2
    assert resp.attempt_history[0].error_category == category
    assert resp.attempt_history[0].retry_after_seconds == retry_after
    assert len(groq.calls) == 1
    assert len(gemini.calls) == 1
    if retry_after is not None:
        assert gateway.health_tracker.cooldown_remaining_seconds(ProviderName.GROQ) == pytest.approx(
            retry_after, abs=0.2
        )


async def test_both_providers_fail_returns_deterministic_fallback(
    gateway_config, fake_clock, sample_request
):
    gateway, groq, gemini = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[
            AIProviderError(ProviderName.GROQ, ErrorCategory.SERVER_ERROR, "Groq 503")
        ],
        gemini_outcomes=[
            AIProviderError(ProviderName.GEMINI, ErrorCategory.RATE_LIMIT, "Gemini 429")
        ],
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.DETERMINISTIC
    assert resp.actual_provider is None
    assert resp.model_id is None
    assert resp.fallback_used is True
    assert resp.service_status == "fallback_only"
    assert resp.attempts == 2
    assert resp.output.cited_evidence_ids == ["ev-1"]
    assert resp.output.quantities == {"transfer_qty": 120}
    assert resp.output.monetary_values == {"transfer_cost": 4500.0}
    assert resp.output.currency == "INR"
    assert resp.authoritative_metrics == sample_request.authoritative_metrics
    assert len(groq.calls) == 1
    assert len(gemini.calls) == 1


async def test_malformed_output_rejected_and_fails_over(
    gateway_config, fake_clock, sample_request
):
    malformed = RawProviderResult(
        provider=ProviderName.GROQ,
        model_id="llama-test-model",
        raw_text="{not valid json",
        latency_ms=40.0,
    )
    gateway, groq, gemini = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[malformed],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.GEMINI
    assert resp.attempts == 2
    assert resp.attempt_history[0].error_category == ErrorCategory.VALIDATION_ERROR
    assert resp.attempt_history[0].validation_passed is False
    assert resp.validation_status == "passed"


async def test_unknown_evidence_id_rejected_and_fails_over(
    gateway_config, fake_clock, sample_request
):
    hallucinated_evidence = make_raw_json_result(
        ProviderName.GROQ,
        cited_evidence_ids=["ev-1", "ev-invented-999"],
    )
    gateway, _, _ = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[hallucinated_evidence],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.GEMINI
    assert resp.attempt_history[0].error_category == ErrorCategory.VALIDATION_ERROR
    assert "ev-invented-999" in (resp.attempt_history[0].detail or "")


async def test_authoritative_metric_override_rejected(
    gateway_config, fake_clock, sample_request
):
    overridden_qty = make_raw_json_result(
        ProviderName.GROQ,
        quantities={"transfer_qty": 999},
    )
    overridden_currency = make_raw_json_result(
        ProviderName.GEMINI,
        currency="USD",
    )
    gateway, _, _ = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[overridden_qty],
        gemini_outcomes=[overridden_currency],
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.DETERMINISTIC
    assert resp.validation_status == "rejected"
    assert resp.output.quantities == {"transfer_qty": 120}
    assert resp.output.currency == "INR"


async def test_safety_refusal_is_not_rerouted(gateway_config, fake_clock, sample_request):
    gateway, groq, gemini = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[
            AISafetyRefusalError(ProviderName.GROQ, "Policy refusal.")
        ],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
    )

    resp = await gateway.execute(sample_request)

    assert resp.refused is True
    assert resp.execution_mode == ExecutionMode.DETERMINISTIC
    assert resp.error_category == ErrorCategory.SAFETY_REFUSAL
    assert resp.attempts == 1
    assert len(groq.calls) == 1
    assert len(gemini.calls) == 0


async def test_completed_side_effect_prevents_failover_retry(
    gateway_config, fake_clock, sample_request
):
    side_effect_request = sample_request.model_copy(
        update={"has_completed_side_effect": True}
    )
    gateway, groq, gemini = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[
            AIProviderError(ProviderName.GROQ, ErrorCategory.TIMEOUT, "Timed out after dispatch")
        ],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
    )

    resp = await gateway.execute(side_effect_request)

    assert resp.execution_mode == ExecutionMode.DETERMINISTIC
    assert resp.attempts == 1
    assert len(groq.calls) == 1
    assert len(gemini.calls) == 0
    assert any("side-effect" in w.lower() for w in resp.warnings)


async def test_overall_deadline_constrains_second_provider_timeout(
    gateway_config, fake_clock, sample_request
):
    tight_config = replace(
        gateway_config,
        request_timeout_seconds=5.0,
        provider_timeout_seconds=4.0,
    )
    gateway, groq, gemini = _build_gateway(
        tight_config,
        fake_clock,
        groq_outcomes=[
            AIProviderError(ProviderName.GROQ, ErrorCategory.TIMEOUT, "Slow timeout")
        ],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
        groq_duration=3.5,
        gemini_duration=0.2,
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.GEMINI
    assert groq.calls[0]["timeout_seconds"] == pytest.approx(4.0)
    assert gemini.calls[0]["timeout_seconds"] == pytest.approx(1.5)


async def test_cooldown_skips_unhealthy_provider_and_probes_after_expiry(
    gateway_config, fake_clock, sample_request
):
    gateway, groq, gemini = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[
            AIProviderError(ProviderName.GROQ, ErrorCategory.SERVER_ERROR, "Groq 503"),
            make_raw_json_result(ProviderName.GROQ),
        ],
        gemini_outcomes=[
            make_raw_json_result(ProviderName.GEMINI),
            make_raw_json_result(ProviderName.GEMINI),
        ],
    )

    # Request 1: Groq fails -> Gemini succeeds, Groq enters 30s cooldown.
    resp1 = await gateway.execute(sample_request)
    assert resp1.execution_mode == ExecutionMode.GEMINI
    assert len(groq.calls) == 1
    assert len(gemini.calls) == 1

    # Request 2 (10s later): Groq is still in cooldown -> skipped, Gemini handles directly.
    fake_clock.advance(10.0)
    resp2 = await gateway.execute(sample_request)
    assert resp2.execution_mode == ExecutionMode.GEMINI
    assert len(groq.calls) == 1
    assert len(gemini.calls) == 2

    # Request 3 (25s later -> 35s total > 30s cooldown): Groq is probed and recovers!
    fake_clock.advance(25.0)
    resp3 = await gateway.execute(sample_request)
    assert resp3.execution_mode == ExecutionMode.GROQ
    assert resp3.service_status == "healthy"
    assert len(groq.calls) == 2
    assert len(gemini.calls) == 2


async def test_single_provider_configuration_groq_only_and_gemini_only(
    gateway_config, fake_clock, sample_request
):
    groq_only_cfg = replace(
        gateway_config,
        gemini=replace(gateway_config.gemini, api_key=None, model=None),
    )
    gw_groq, groq_ok, gemini_unconf = _build_gateway(
        groq_only_cfg,
        fake_clock,
        groq_outcomes=[make_raw_json_result(ProviderName.GROQ)],
        gemini_outcomes=[],
    )
    resp_groq = await gw_groq.execute(sample_request)
    assert resp_groq.execution_mode == ExecutionMode.GROQ
    assert len(groq_ok.calls) == 1
    assert len(gemini_unconf.calls) == 0

    gemini_only_cfg = replace(
        gateway_config,
        groq=replace(gateway_config.groq, api_key=None, model=None),
        primary_provider=ProviderName.GROQ,
    )
    gw_gemini, groq_unconf, gemini_ok = _build_gateway(
        gemini_only_cfg,
        fake_clock,
        groq_outcomes=[],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
    )
    resp_gemini = await gw_gemini.execute(sample_request)
    assert resp_gemini.execution_mode == ExecutionMode.GEMINI
    assert resp_gemini.fallback_used is True
    assert len(groq_unconf.calls) == 0
    assert len(gemini_ok.calls) == 1
    assert any("groq" in w.lower() and "not configured" in w.lower() for w in resp_gemini.warnings)


async def test_per_request_preferred_provider_override(
    gateway_config, fake_clock, sample_request
):
    gateway, groq, gemini = _build_gateway(
        gateway_config,
        fake_clock,
        groq_outcomes=[],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
    )
    override_req = sample_request.model_copy(
        update={"preferred_provider": ProviderName.GEMINI}
    )

    resp = await gateway.execute(override_req)

    assert resp.preferred_provider == ProviderName.GEMINI
    assert resp.actual_provider == ProviderName.GEMINI
    assert resp.execution_mode == ExecutionMode.GEMINI
    assert resp.fallback_used is False
    assert len(gemini.calls) == 1
    assert len(groq.calls) == 0


async def test_exhausted_overall_deadline_skips_backup_provider(
    gateway_config, fake_clock, sample_request
):
    tight_config = replace(
        gateway_config,
        request_timeout_seconds=4.0,
        provider_timeout_seconds=4.0,
    )
    gateway, groq, gemini = _build_gateway(
        tight_config,
        fake_clock,
        groq_outcomes=[
            AIProviderError(ProviderName.GROQ, ErrorCategory.TIMEOUT, "Consumed budget")
        ],
        gemini_outcomes=[make_raw_json_result(ProviderName.GEMINI)],
        groq_duration=3.98,
        gemini_duration=0.1,
    )

    resp = await gateway.execute(sample_request)

    assert resp.execution_mode == ExecutionMode.DETERMINISTIC
    assert resp.fallback_used is True
    assert resp.error_category == ErrorCategory.TIMEOUT
    assert resp.attempts == 1
    assert len(groq.calls) == 1
    assert len(gemini.calls) == 0
    assert any("deadline exceeded" in w.lower() for w in resp.warnings)
