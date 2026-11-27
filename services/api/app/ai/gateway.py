"""Central AI Gateway orchestration with failover, validation, and fallback."""

from __future__ import annotations

import time
from typing import Callable, Mapping

from .config import GatewayConfig
from .exceptions import (
    AIConfigurationError,
    AIProviderError,
    AISafetyRefusalError,
)
from .fallback import DeterministicFallbackService
from .health import ProviderHealthTracker
from .observability import log_gateway_decision, log_provider_attempt_failure
from .providers.base import ProviderAdapter
from .providers.gemini_adapter import GeminiAdapter
from .providers.groq_adapter import GroqAdapter
from .schemas import (
    AttemptTelemetry,
    ErrorCategory,
    ExecutionMode,
    GatewayHealthResponse,
    GatewayRequest,
    GatewayResponse,
    ProviderName,
)
from .validator import ResponseValidator

_MIN_ATTEMPT_BUDGET_SECONDS = 0.05


class AIGatewayService:
    """Unified backend AI Gateway supporting Groq, Gemini, failover, and fallback."""

    def __init__(
        self,
        config: GatewayConfig,
        *,
        adapters: Mapping[ProviderName, ProviderAdapter] | None = None,
        validator: ResponseValidator | None = None,
        health_tracker: ProviderHealthTracker | None = None,
        fallback_service: DeterministicFallbackService | None = None,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._config = config
        self._clock = clock or time.monotonic
        self._health = health_tracker or ProviderHealthTracker(clock=self._clock)
        self._validator = validator or ResponseValidator()
        self._fallback = fallback_service or DeterministicFallbackService()
        self._adapters: dict[ProviderName, ProviderAdapter] = (
            dict(adapters)
            if adapters is not None
            else {
                ProviderName.GROQ: GroqAdapter(config.groq),
                ProviderName.GEMINI: GeminiAdapter(config.gemini),
            }
        )

    @property
    def config(self) -> GatewayConfig:
        return self._config

    @property
    def health_tracker(self) -> ProviderHealthTracker:
        return self._health

    async def execute(self, request: GatewayRequest) -> GatewayResponse:
        """Execute an AI task with automatic failover, validation, and fallback."""
        started = self._clock()
        deadline = started + self._config.request_timeout_seconds
        preferred = request.preferred_provider or self._config.primary_provider
        backup = (
            ProviderName.GEMINI
            if preferred == ProviderName.GROQ
            else ProviderName.GROQ
        )

        attempts_log: list[AttemptTelemetry] = []
        warnings: list[str] = []
        last_error_category = ErrorCategory.UNAVAILABLE
        last_error_detail: str | None = None

        candidates = self._select_candidates(preferred, backup, warnings)

        for idx, provider in enumerate(candidates):
            remaining = deadline - self._clock()
            if remaining <= _MIN_ATTEMPT_BUDGET_SECONDS:
                last_error_category = ErrorCategory.TIMEOUT
                last_error_detail = "Overall AI Gateway request deadline exceeded."
                warnings.append(last_error_detail)
                break

            attempt_timeout = min(self._config.provider_timeout_seconds, remaining)
            adapter = self._adapters[provider]
            attempt_started = self._clock()

            try:
                raw_result = await adapter.generate(request, attempt_timeout)
            except AISafetyRefusalError as exc:
                latency_ms = (self._clock() - attempt_started) * 1000.0
                attempts_log.append(
                    AttemptTelemetry(
                        provider=provider,
                        model_id=adapter.model_id or "unconfigured",
                        latency_ms=round(latency_ms, 2),
                        succeeded=False,
                        error_category=ErrorCategory.SAFETY_REFUSAL,
                        validation_passed=False,
                        detail="Safety refusal; failover suppressed.",
                    )
                )
                return self._finalize_deterministic(
                    request=request,
                    preferred=preferred,
                    started=started,
                    attempts_log=attempts_log,
                    error_category=ErrorCategory.SAFETY_REFUSAL,
                    reason=str(exc),
                    refused=True,
                    warnings=warnings,
                )
            except AIConfigurationError as exc:
                latency_ms = (self._clock() - attempt_started) * 1000.0
                last_error_category = ErrorCategory.AUTHENTICATION
                last_error_detail = str(exc)
                attempts_log.append(
                    AttemptTelemetry(
                        provider=provider,
                        model_id=adapter.model_id or "unconfigured",
                        latency_ms=round(latency_ms, 2),
                        succeeded=False,
                        error_category=ErrorCategory.AUTHENTICATION,
                        validation_passed=False,
                        detail=last_error_detail,
                    )
                )
                self._health.record_failure(
                    provider,
                    ErrorCategory.AUTHENTICATION,
                    latency_ms,
                    default_cooldown_seconds=self._config.cooldown_seconds,
                )
                log_provider_attempt_failure(
                    request_id=request.request_id,
                    task_type=request.task_type,
                    provider=provider.value,
                    model_id=adapter.model_id or None,
                    latency_ms=latency_ms,
                    error_category=ErrorCategory.AUTHENTICATION.value,
                    detail=last_error_detail,
                    secrets=self._config.secret_values(),
                )
                continue
            except AIProviderError as exc:
                latency_ms = (self._clock() - attempt_started) * 1000.0
                last_error_category = exc.category
                last_error_detail = str(exc)
                attempts_log.append(
                    AttemptTelemetry(
                        provider=provider,
                        model_id=adapter.model_id or "unknown",
                        latency_ms=round(latency_ms, 2),
                        succeeded=False,
                        error_category=exc.category,
                        validation_passed=False,
                        retry_after_seconds=exc.retry_after_seconds,
                        detail=last_error_detail,
                    )
                )
                self._health.record_failure(
                    provider,
                    exc.category,
                    latency_ms,
                    retry_after_seconds=exc.retry_after_seconds,
                    default_cooldown_seconds=self._config.cooldown_seconds,
                )
                log_provider_attempt_failure(
                    request_id=request.request_id,
                    task_type=request.task_type,
                    provider=provider.value,
                    model_id=adapter.model_id or None,
                    latency_ms=latency_ms,
                    error_category=exc.category.value,
                    detail=last_error_detail,
                    secrets=self._config.secret_values(),
                )
                if request.has_completed_side_effect:
                    warnings.append(
                        "Side-effect safety guard prevented failover retry after failure."
                    )
                    break
                continue

            validation = self._validator.validate(request, raw_result)
            if not validation.valid or validation.output is None:
                last_error_category = ErrorCategory.VALIDATION_ERROR
                last_error_detail = "; ".join(validation.errors)
                attempts_log.append(
                    AttemptTelemetry(
                        provider=provider,
                        model_id=raw_result.model_id,
                        latency_ms=round(raw_result.latency_ms, 2),
                        succeeded=False,
                        error_category=ErrorCategory.VALIDATION_ERROR,
                        validation_passed=False,
                        detail=last_error_detail,
                    )
                )
                self._health.record_failure(
                    provider,
                    ErrorCategory.VALIDATION_ERROR,
                    raw_result.latency_ms,
                    default_cooldown_seconds=self._config.cooldown_seconds,
                )
                log_provider_attempt_failure(
                    request_id=request.request_id,
                    task_type=request.task_type,
                    provider=provider.value,
                    model_id=raw_result.model_id,
                    latency_ms=raw_result.latency_ms,
                    error_category=ErrorCategory.VALIDATION_ERROR.value,
                    detail=last_error_detail,
                    secrets=self._config.secret_values(),
                )
                if request.has_completed_side_effect:
                    warnings.append(
                        "Side-effect safety guard prevented failover retry after invalid output."
                    )
                    break
                continue

            self._health.record_success(provider, raw_result.latency_ms)
            attempts_log.append(
                AttemptTelemetry(
                    provider=provider,
                    model_id=raw_result.model_id,
                    latency_ms=round(raw_result.latency_ms, 2),
                    succeeded=True,
                    error_category=ErrorCategory.NONE,
                    validation_passed=True,
                )
            )
            used_failover = idx > 0 or provider != preferred
            total_latency_ms = (self._clock() - started) * 1000.0
            response = GatewayResponse(
                request_id=request.request_id,
                task_type=str(request.task_type),
                execution_mode=ExecutionMode(provider.value),
                preferred_provider=preferred,
                actual_provider=provider,
                model_id=raw_result.model_id,
                latency_ms=round(total_latency_ms, 2),
                attempts=len(attempts_log),
                attempt_history=attempts_log,
                error_category=ErrorCategory.NONE,
                fallback_used=used_failover,
                validation_status="passed",
                service_status="degraded" if used_failover else "healthy",
                output=validation.output,
                authoritative_metrics=request.authoritative_metrics,
                refused=False,
                warnings=warnings,
            )
            log_gateway_decision(response, secrets=self._config.secret_values())
            return response

        return self._finalize_deterministic(
            request=request,
            preferred=preferred,
            started=started,
            attempts_log=attempts_log,
            error_category=last_error_category,
            reason=last_error_detail,
            refused=False,
            warnings=warnings,
        )

    def _select_candidates(
        self,
        preferred: ProviderName,
        backup: ProviderName,
        warnings: list[str],
    ) -> list[ProviderName]:
        candidates: list[ProviderName] = []
        for provider in (preferred, backup):
            adapter = self._adapters.get(provider)
            if adapter is None or not adapter.is_configured:
                warnings.append(
                    f"Provider {provider.value} skipped: not configured."
                )
                continue
            if self._health.is_in_cooldown(provider) and not self._health.should_probe(provider):
                remaining = self._health.cooldown_remaining_seconds(provider)
                warnings.append(
                    f"Provider {provider.value} skipped: in cooldown ({remaining:.1f}s remaining)."
                )
                continue
            candidates.append(provider)
        return candidates

    def _finalize_deterministic(
        self,
        *,
        request: GatewayRequest,
        preferred: ProviderName,
        started: float,
        attempts_log: list[AttemptTelemetry],
        error_category: ErrorCategory,
        reason: str | None,
        refused: bool,
        warnings: list[str],
    ) -> GatewayResponse:
        total_latency_ms = (self._clock() - started) * 1000.0
        output = self._fallback.build_output(
            request,
            error_category=error_category,
            refused=refused,
            reason=reason,
        )
        validation_status = (
            "rejected" if error_category == ErrorCategory.VALIDATION_ERROR else "not_applicable"
        )
        response = GatewayResponse(
            request_id=request.request_id,
            task_type=str(request.task_type),
            execution_mode=ExecutionMode.DETERMINISTIC,
            preferred_provider=preferred,
            actual_provider=None,
            model_id=None,
            latency_ms=round(total_latency_ms, 2),
            attempts=len(attempts_log),
            attempt_history=attempts_log,
            error_category=error_category,
            fallback_used=True,
            validation_status=validation_status,
            service_status="fallback_only",
            output=output,
            authoritative_metrics=request.authoritative_metrics,
            refused=refused,
            warnings=warnings,
        )
        log_gateway_decision(response, secrets=self._config.secret_values())
        return response

    async def health_check(self) -> GatewayHealthResponse:
        """Return live provider configuration, cooldown, and gateway readiness status."""
        snapshots = {}
        configured_count = 0
        healthy_count = 0

        for provider in (ProviderName.GROQ, ProviderName.GEMINI):
            adapter = self._adapters[provider]
            settings = self._config.get_provider_settings(provider)
            snapshot = self._health.get_snapshot(
                provider,
                configured=adapter.is_configured,
                model_id=settings.model,
                configuration_errors=adapter.configuration_errors(),
            )
            snapshots[provider.value] = snapshot
            if snapshot.configured:
                configured_count += 1
            if snapshot.healthy:
                healthy_count += 1

        if healthy_count == 2 or (configured_count == 1 and healthy_count == 1):
            overall_status = "healthy"
        elif healthy_count >= 1:
            overall_status = "degraded"
        else:
            overall_status = "fallback_only"

        return GatewayHealthResponse(
            status=overall_status,
            primary_provider=self._config.primary_provider,
            request_timeout_seconds=self._config.request_timeout_seconds,
            provider_timeout_seconds=self._config.provider_timeout_seconds,
            providers=snapshots,
        )


def create_default_gateway() -> AIGatewayService:
    """Construct an AIGatewayService configured from process environment variables."""
    config = GatewayConfig.from_env()
    return AIGatewayService(config=config)
