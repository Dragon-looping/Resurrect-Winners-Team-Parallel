"""Shared fixtures and stub adapters for AI Gateway tests."""

from __future__ import annotations

import json
from collections import deque
from typing import Any

import pytest
from pydantic import SecretStr

from app.ai.config import GatewayConfig, ProviderSettings
from app.ai.providers.base import ProviderAdapter, RawProviderResult
from app.ai.schemas import (
    AuthoritativeMetrics,
    EvidenceItem,
    GatewayRequest,
    ProviderName,
    TaskType,
)


class FakeClock:
    """Deterministic monotonic clock for testing deadlines and cooldowns."""

    def __init__(self, initial: float = 1000.0) -> None:
        self.now = initial

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> float:
        self.now += seconds
        return self.now


class StubProviderAdapter(ProviderAdapter):
    """Deterministic async stub adapter recording all calls and timeouts."""

    def __init__(
        self,
        settings: ProviderSettings,
        *,
        outcomes: list[RawProviderResult | BaseException] | None = None,
        clock: FakeClock | None = None,
        simulated_duration_seconds: float = 0.05,
    ) -> None:
        super().__init__(settings)
        self.provider_name = settings.provider
        self._outcomes: deque[RawProviderResult | BaseException] = deque(outcomes or [])
        self._clock = clock
        self._simulated_duration = simulated_duration_seconds
        self.calls: list[dict[str, Any]] = []

    def push_outcome(self, outcome: RawProviderResult | BaseException) -> None:
        self._outcomes.append(outcome)

    async def generate(
        self,
        request: GatewayRequest,
        timeout_seconds: float,
    ) -> RawProviderResult:
        self.calls.append(
            {
                "request_id": request.request_id,
                "timeout_seconds": timeout_seconds,
            }
        )
        if self._clock is not None and self._simulated_duration > 0:
            self._clock.advance(min(self._simulated_duration, timeout_seconds))

        if not self._outcomes:
            raise AssertionError(f"No stubbed outcome remaining for {self.provider_name.value}.")

        outcome = self._outcomes.popleft()
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


def make_raw_json_result(
    provider: ProviderName,
    *,
    model_id: str | None = None,
    summary: str = "Transfer 120 units from Godown-B to Godown-A.",
    explanation: str = "Grounded against ev-1.",
    cited_evidence_ids: list[str] | None = None,
    quantities: dict[str, int | float] | None = None,
    monetary_values: dict[str, float] | None = None,
    currency: str | None = "INR",
    data: dict[str, Any] | None = None,
    latency_ms: float = 120.0,
) -> RawProviderResult:
    payload = {
        "summary": summary,
        "explanation": explanation,
        "cited_evidence_ids": ["ev-1"] if cited_evidence_ids is None else cited_evidence_ids,
        "quantities": {"transfer_qty": 120} if quantities is None else quantities,
        "monetary_values": {"transfer_cost": 4500.0} if monetary_values is None else monetary_values,
        "currency": currency,
        "clarification_choices": [],
        "route_to_planner": False,
        "data": {} if data is None else data,
    }
    default_model = (
        "llama-test-model" if provider == ProviderName.GROQ else "gemini-test-model"
    )
    return RawProviderResult(
        provider=provider,
        model_id=model_id or default_model,
        raw_text=json.dumps(payload),
        latency_ms=latency_ms,
        finish_reason="stop",
    )


@pytest.fixture
def fake_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def gateway_config() -> GatewayConfig:
    return GatewayConfig(
        groq=ProviderSettings(
            provider=ProviderName.GROQ,
            api_key=SecretStr("gsk_test_super_secret_groq_key_12345"),
            model="llama-test-model",
        ),
        gemini=ProviderSettings(
            provider=ProviderName.GEMINI,
            api_key=SecretStr("AIzaSyTestSuperSecretGeminiKey12345"),
            model="gemini-test-model",
        ),
        primary_provider=ProviderName.GROQ,
        request_timeout_seconds=10.0,
        provider_timeout_seconds=4.0,
        cooldown_seconds=30.0,
    )


@pytest.fixture
def sample_request() -> GatewayRequest:
    return GatewayRequest(
        request_id="req-test-001",
        task_type=TaskType.EXPLANATION,
        prompt="Explain the transfer plan for SKU-402.",
        evidence=[
            EvidenceItem(
                evidence_id="ev-1",
                source_type="calculation_result",
                summary="Godown-B transfers 120 units to Godown-A at INR 4500.",
                authoritative_values={"transfer_qty": 120, "transfer_cost": 4500.0},
            )
        ],
        authoritative_metrics=AuthoritativeMetrics(
            quantities={"transfer_qty": 120},
            monetary_amounts={"transfer_cost": 4500.0},
            currency="INR",
            dates={"dispatch_date": "2026-11-28"},
        ),
        required_fields=["summary", "explanation"],
    )
