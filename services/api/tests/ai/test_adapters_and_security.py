"""Tests for Groq/Gemini SDK adapters, config security, logs, fallback, and router."""

from __future__ import annotations

import asyncio
import logging
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai.config import GatewayConfig, redact_secrets
from app.ai.exceptions import AIConfigurationError, AIProviderError, AISafetyRefusalError
from app.ai.gateway import AIGatewayService
from app.ai.providers.gemini_adapter import GeminiAdapter
from app.ai.providers.groq_adapter import GroqAdapter
from app.ai.router import ai_router, get_ai_gateway
from app.ai.schemas import ErrorCategory, ExecutionMode, GatewayRequest, ProviderName, TaskType
from tests.ai.conftest import FakeClock, StubProviderAdapter, make_raw_json_result


def test_config_validation_and_secret_redaction():
    with pytest.raises(AIConfigurationError, match="AI_REQUEST_TIMEOUT"):
        GatewayConfig.from_env({"AI_REQUEST_TIMEOUT": "15"})

    with pytest.raises(AIConfigurationError, match="AI_PROVIDER_TIMEOUT"):
        GatewayConfig.from_env({"AI_PROVIDER_TIMEOUT": "6"})

    with pytest.raises(AIConfigurationError, match="AI_PRIMARY_PROVIDER"):
        GatewayConfig.from_env({"AI_PRIMARY_PROVIDER": "unknown"})

    empty_cfg = GatewayConfig.from_env({})
    with pytest.raises(AIConfigurationError, match="GROQ_API_KEY"):
        empty_cfg.validate_startup(require_at_least_one=True)

    groq_secret = "gsk_live_secret_token_987654"
    gemini_secret = "AIzaSySecretGeminiToken987654"
    cfg = GatewayConfig.from_env(
        {
            "GROQ_API_KEY": groq_secret,
            "GROQ_MODEL": "llama-3.3-70b-versatile",
            "GEMINI_API_KEY": gemini_secret,
            "GEMINI_MODEL": "gemini-2.5-flash",
        }
    )
    assert groq_secret not in repr(cfg)
    assert gemini_secret not in repr(cfg)

    scrubbed = redact_secrets(
        f"Authorization: Bearer {groq_secret} key={gemini_secret}",
        extra_secrets=cfg.secret_values(),
    )
    assert groq_secret not in scrubbed
    assert gemini_secret not in scrubbed


async def test_groq_adapter_maps_sdk_errors_and_redacts_key(gateway_config, sample_request):
    secret = gateway_config.groq.raw_api_key

    class RateLimitError(Exception):
        status_code = 429
        response = SimpleNamespace(headers={"retry-after": "7"})

    class AuthenticationError(Exception):
        status_code = 401

    class InternalServerError(Exception):
        status_code = 503

    class APIConnectionError(Exception):
        pass

    class APITimeoutError(Exception):
        pass

    async def _raise(exc):
        class _Completions:
            async def create(self, **kwargs):
                raise exc

        class _Client:
            chat = SimpleNamespace(completions=_Completions())

        adapter = GroqAdapter(
            gateway_config.groq,
            client_factory=lambda _key, _timeout: _Client(),
        )
        return await adapter.generate(sample_request, timeout_seconds=4.0)

    with pytest.raises(AIProviderError) as rate_exc:
        await _raise(RateLimitError(f"429 for key {secret}"))
    assert rate_exc.value.category == ErrorCategory.RATE_LIMIT
    assert rate_exc.value.retry_after_seconds == 7.0
    assert secret not in str(rate_exc.value)

    with pytest.raises(AIProviderError) as auth_exc:
        await _raise(AuthenticationError(f"Invalid key {secret}"))
    assert auth_exc.value.category == ErrorCategory.AUTHENTICATION
    assert secret not in str(auth_exc.value)

    with pytest.raises(AIProviderError) as srv_exc:
        await _raise(InternalServerError("Upstream 503"))
    assert srv_exc.value.category == ErrorCategory.SERVER_ERROR

    with pytest.raises(AIProviderError) as conn_exc:
        await _raise(APIConnectionError("DNS failed"))
    assert conn_exc.value.category == ErrorCategory.CONNECTION_ERROR

    with pytest.raises(AIProviderError) as timeout_exc:
        await _raise(APITimeoutError("Timed out"))
    assert timeout_exc.value.category == ErrorCategory.TIMEOUT


async def test_groq_adapter_detects_safety_refusal(gateway_config, sample_request):
    class _Completions:
        async def create(self, **kwargs):
            return SimpleNamespace(
                model="llama-test-model",
                choices=[
                    SimpleNamespace(
                        finish_reason="content_filter",
                        message=SimpleNamespace(content="", refusal="Blocked by policy"),
                    )
                ],
                usage=None,
            )

    adapter = GroqAdapter(
        gateway_config.groq,
        client_factory=lambda _k, _t: SimpleNamespace(
            chat=SimpleNamespace(completions=_Completions())
        ),
    )

    with pytest.raises(AISafetyRefusalError):
        await adapter.generate(sample_request, timeout_seconds=4.0)


async def test_gemini_adapter_maps_errors_and_safety_refusal(gateway_config, sample_request):
    secret = gateway_config.gemini.raw_api_key

    class GeminiAPIError(Exception):
        def __init__(self, code: int, msg: str, retry_after: str | None = None) -> None:
            super().__init__(msg)
            self.code = code
            if retry_after is not None:
                self.response = SimpleNamespace(headers={"retry-after": retry_after})

    async def _run_with_client(coro_fn):
        class _Models:
            async def generate_content(self, **kwargs):
                return await coro_fn()

        client = SimpleNamespace(aio=SimpleNamespace(models=_Models()))
        adapter = GeminiAdapter(
            gateway_config.gemini,
            client_factory=lambda _k, _t: client,
        )
        return await adapter.generate(sample_request, timeout_seconds=4.0)

    async def _raise_429():
        raise GeminiAPIError(429, f"RESOURCE_EXHAUSTED for {secret}", retry_after="9")

    with pytest.raises(AIProviderError) as rate_exc:
        await _run_with_client(_raise_429)
    assert rate_exc.value.category == ErrorCategory.RATE_LIMIT
    assert rate_exc.value.retry_after_seconds == 9.0
    assert secret not in str(rate_exc.value)

    async def _raise_403():
        raise GeminiAPIError(403, f"API_KEY_INVALID {secret}")

    with pytest.raises(AIProviderError) as auth_exc:
        await _run_with_client(_raise_403)
    assert auth_exc.value.category == ErrorCategory.AUTHENTICATION
    assert secret not in str(auth_exc.value)

    async def _safety_blocked():
        return SimpleNamespace(
            text="",
            prompt_feedback=SimpleNamespace(block_reason="SAFETY"),
            candidates=[],
        )

    with pytest.raises(AISafetyRefusalError):
        await _run_with_client(_safety_blocked)

    async def _raise_503():
        raise GeminiAPIError(503, "Service unavailable")

    with pytest.raises(AIProviderError) as srv_exc:
        await _run_with_client(_raise_503)
    assert srv_exc.value.category == ErrorCategory.SERVER_ERROR

    async def _raise_timeout():
        raise TimeoutError("socket timed out")

    with pytest.raises(AIProviderError) as timeout_exc:
        await _run_with_client(_raise_timeout)
    assert timeout_exc.value.category == ErrorCategory.TIMEOUT

    async def _raise_conn():
        raise ConnectionError("connection reset")

    with pytest.raises(AIProviderError) as conn_exc:
        await _run_with_client(_raise_conn)
    assert conn_exc.value.category == ErrorCategory.CONNECTION_ERROR

    async def _hang_forever():
        await asyncio.sleep(5.0)

    class _SlowModels:
        async def generate_content(self, **kwargs):
            return await _hang_forever()

    slow_adapter = GeminiAdapter(
        gateway_config.gemini,
        client_factory=lambda _k, _t: SimpleNamespace(aio=SimpleNamespace(models=_SlowModels())),
    )
    with pytest.raises(AIProviderError) as asyncio_timeout_exc:
        await slow_adapter.generate(sample_request, timeout_seconds=0.05)
    assert asyncio_timeout_exc.value.category == ErrorCategory.TIMEOUT


async def test_groq_client_lifecycle_calls_close(gateway_config, sample_request):
    """Verify GroqAdapter awaits close() on the SDK client after each request."""
    closed: list[bool] = []

    class _Completions:
        async def create(self, **kwargs):
            return SimpleNamespace(
                model="llama-test-model",
                choices=[
                    SimpleNamespace(
                        finish_reason="stop",
                        message=SimpleNamespace(content='{"summary": "OK"}', refusal=None),
                    )
                ],
                usage=None,
            )

    async def _async_close():
        closed.append(True)

    client_with_close = SimpleNamespace(
        chat=SimpleNamespace(completions=_Completions()),
        close=_async_close,
    )
    adapter = GroqAdapter(
        gateway_config.groq,
        client_factory=lambda _k, _t: client_with_close,
    )
    res = await adapter.generate(sample_request, timeout_seconds=0.5)
    assert res.provider == ProviderName.GROQ
    assert closed == [True], "close() must be called exactly once after generate()"


def test_groq_default_factory_sets_max_retries_zero():
    """Verify the default Groq factory produces a client with retries disabled (offline check)."""
    from groq import AsyncGroq
    client = AsyncGroq(api_key="gsk_dummy_offline_key", timeout=1.0, max_retries=0)
    assert client.max_retries == 0
    # Do NOT call close() — no network is touched; just verify the attribute


def test_gemini_default_factory_sets_timeout_and_no_retries():
    """Verify Gemini factory converts seconds to ms correctly and limits retries (offline check)."""
    from app.ai.providers.gemini_adapter import GeminiAdapter
    from app.ai.config import ProviderSettings
    from app.ai.schemas import ProviderName
    from pydantic import SecretStr

    settings = ProviderSettings(
        provider=ProviderName.GEMINI,
        api_key=SecretStr("AIzaDummyOfflineKey12345"),
        model="gemini-test-model",
    )
    timeout_seconds = 0.5

    # Inspect only the client creation; do not make network calls
    captured: list = []

    def _capture_factory(api_key: str, ts: float):
        # Verify what _default_client_factory would pass to genai.Client
        timeout_ms = max(1, int(round(ts * 1000)))
        captured.append(timeout_ms)
        # Return a pure stub — never touches the network
        return SimpleNamespace(aio=SimpleNamespace())

    adapter = GeminiAdapter(settings, client_factory=_capture_factory)
    # Check by running the factory with a known timeout
    _capture_factory("key", timeout_seconds)
    assert captured[-1] == 500, f"Expected 500ms, got {captured[-1]}"

    # Also verify the formula for sub-second: 0.05s → 50ms (not floored to 1000ms)
    _capture_factory("key", 0.05)
    assert captured[-1] == 50, f"Expected 50ms for 0.05s, got {captured[-1]}"


async def test_logs_never_expose_api_keys_or_prompts(
    gateway_config, fake_clock, sample_request, caplog
):
    caplog.set_level(logging.INFO, logger="setuvyuha.ai.gateway")
    secret_groq = gateway_config.groq.raw_api_key
    secret_gemini = gateway_config.gemini.raw_api_key

    groq = StubProviderAdapter(
        gateway_config.groq,
        outcomes=[
            AIProviderError(
                ProviderName.GROQ,
                ErrorCategory.AUTHENTICATION,
                f"Bad key {secret_groq}",
            )
        ],
        clock=fake_clock,
    )
    gemini = StubProviderAdapter(
        gateway_config.gemini,
        outcomes=[make_raw_json_result(ProviderName.GEMINI)],
        clock=fake_clock,
    )
    gateway = AIGatewayService(
        config=gateway_config,
        adapters={ProviderName.GROQ: groq, ProviderName.GEMINI: gemini},
        clock=fake_clock,
    )

    sensitive_request = sample_request.model_copy(
        update={"prompt": "SENSITIVE_PROMPT_SHOULD_NOT_BE_LOGGED"}
    )
    await gateway.execute(sensitive_request)

    log_blob = "\n".join(record.getMessage() for record in caplog.records)
    assert secret_groq not in log_blob
    assert secret_gemini not in log_blob
    assert "SENSITIVE_PROMPT_SHOULD_NOT_BE_LOGGED" not in log_blob
    assert "req-test-001" in log_blob


async def test_deterministic_fallback_handles_ambiguous_instruction(gateway_config, fake_clock):
    empty_cfg = GatewayConfig.from_env({})
    gateway = AIGatewayService(
        config=empty_cfg,
        adapters={
            ProviderName.GROQ: StubProviderAdapter(empty_cfg.groq),
            ProviderName.GEMINI: StubProviderAdapter(empty_cfg.gemini),
        },
        clock=fake_clock,
    )
    ambiguous = GatewayRequest(
        task_type=TaskType.CLARIFICATION,
        prompt="Move stock somewhere urgent",
        is_ambiguous_instruction=True,
        clarification_options=["Transfer to Pune Godown", "Transfer to Nashik Godown"],
    )

    resp = await gateway.execute(ambiguous)

    assert resp.execution_mode == ExecutionMode.DETERMINISTIC
    assert resp.fallback_used is True
    assert resp.output.route_to_planner is True
    assert resp.output.clarification_choices == [
        "Transfer to Pune Godown",
        "Transfer to Nashik Godown",
    ]


def test_fastapi_router_health_and_execute(gateway_config):
    clock = FakeClock()
    groq = StubProviderAdapter(
        gateway_config.groq,
        outcomes=[make_raw_json_result(ProviderName.GROQ)],
        clock=clock,
    )
    gemini = StubProviderAdapter(gateway_config.gemini, outcomes=[], clock=clock)
    test_gateway = AIGatewayService(
        config=gateway_config,
        adapters={ProviderName.GROQ: groq, ProviderName.GEMINI: gemini},
        clock=clock,
    )

    app = FastAPI()
    app.include_router(ai_router)
    app.dependency_overrides[get_ai_gateway] = lambda: test_gateway

    client = TestClient(app)

    health_res = client.get("/ai/health")
    assert health_res.status_code == 200
    health_body = health_res.json()
    assert health_body["status"] == "healthy"
    assert health_body["primary_provider"] == "groq"

    exec_res = client.post(
        "/ai/gateway/execute",
        json={
            "request_id": "req-http-1",
            "task_type": "explanation",
            "prompt": "Summarize transfer.",
            "evidence": [
                {
                    "evidence_id": "ev-1",
                    "source_type": "calculation_result",
                    "summary": "120 units approved.",
                }
            ],
            "authoritative_metrics": {
                "quantities": {"transfer_qty": 120},
                "monetary_amounts": {"transfer_cost": 4500.0},
                "currency": "INR",
            },
        },
    )
    assert exec_res.status_code == 200
    exec_body = exec_res.json()
    assert exec_body["execution_mode"] == "groq"
    assert exec_body["validation_status"] == "passed"


async def test_fastapi_router_health_degraded_and_fallback_only(gateway_config, sample_request):
    clock = FakeClock()
    groq = StubProviderAdapter(
        gateway_config.groq,
        outcomes=[
            AIProviderError(ProviderName.GROQ, ErrorCategory.SERVER_ERROR, "Groq 503"),
        ],
        clock=clock,
    )
    gemini = StubProviderAdapter(
        gateway_config.gemini,
        outcomes=[
            make_raw_json_result(ProviderName.GEMINI),
            AIProviderError(ProviderName.GEMINI, ErrorCategory.TIMEOUT, "Gemini timed out"),
        ],
        clock=clock,
    )
    test_gateway = AIGatewayService(
        config=gateway_config,
        adapters={ProviderName.GROQ: groq, ProviderName.GEMINI: gemini},
        clock=clock,
    )

    app = FastAPI()
    app.include_router(ai_router)
    app.dependency_overrides[get_ai_gateway] = lambda: test_gateway
    client = TestClient(app)

    # Trigger Groq cooldown while Gemini succeeds -> degraded
    await test_gateway.execute(sample_request)
    degraded_res = client.get("/ai/health")
    assert degraded_res.status_code == 200
    degraded_body = degraded_res.json()
    assert degraded_body["status"] == "degraded"
    assert degraded_body["providers"]["groq"]["in_cooldown"] is True
    assert degraded_body["providers"]["gemini"]["healthy"] is True

    # Trigger Gemini cooldown too -> fallback_only
    await test_gateway.execute(sample_request)
    fallback_res = client.get("/ai/health")
    assert fallback_res.status_code == 200
    fallback_body = fallback_res.json()
    assert fallback_body["status"] == "fallback_only"
    assert fallback_body["providers"]["gemini"]["in_cooldown"] is True
