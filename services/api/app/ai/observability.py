"""Structured, secret-safe observability logging for the AI Gateway."""

from __future__ import annotations

import json
import logging
from typing import Any, Iterable

from .config import redact_secrets
from .schemas import GatewayResponse

LOGGER_NAME = "setuvyuha.ai.gateway"
logger = logging.getLogger(LOGGER_NAME)


def log_gateway_decision(
    response: GatewayResponse,
    *,
    secrets: Iterable[str] = (),
) -> dict[str, Any]:
    """Emit a structured log record for a completed gateway request without secrets."""
    payload: dict[str, Any] = {
        "event": "ai_gateway_request",
        "request_id": response.request_id,
        "task_type": response.task_type,
        "preferred_provider": response.preferred_provider.value,
        "actual_provider": response.actual_provider.value if response.actual_provider else None,
        "model_id": response.model_id,
        "execution_mode": response.execution_mode.value,
        "latency_ms": round(response.latency_ms, 2),
        "attempts": response.attempts,
        "error_category": response.error_category.value,
        "fallback_used": response.fallback_used,
        "validation_status": response.validation_status,
        "service_status": response.service_status,
        "refused": response.refused,
    }
    serialized = redact_secrets(json.dumps(payload, sort_keys=True), extra_secrets=secrets)
    if response.fallback_used or response.error_category.value != "none":
        logger.warning(serialized)
    else:
        logger.info(serialized)
    return payload


def log_provider_attempt_failure(
    *,
    request_id: str,
    task_type: str,
    provider: str,
    model_id: str | None,
    latency_ms: float,
    error_category: str,
    detail: str,
    secrets: Iterable[str] = (),
) -> None:
    """Log a single provider attempt failure with secrets redacted."""
    payload = {
        "event": "ai_provider_attempt_failed",
        "request_id": request_id,
        "task_type": task_type,
        "provider": provider,
        "model_id": model_id,
        "latency_ms": round(latency_ms, 2),
        "error_category": error_category,
        "detail": redact_secrets(detail, extra_secrets=secrets)[:300],
    }
    logger.warning(redact_secrets(json.dumps(payload, sort_keys=True), extra_secrets=secrets))
