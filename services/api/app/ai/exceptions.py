"""Custom exceptions for the SETUVYUHA AI Gateway."""

from __future__ import annotations

from .schemas import ErrorCategory, ProviderName


class AIGatewayError(Exception):
    """Base exception for AI Gateway errors."""


class AIConfigurationError(AIGatewayError):
    """Raised when required provider or gateway configuration is invalid or missing."""


class AIProviderError(AIGatewayError):
    """Normalized exception raised by provider adapters on failure."""

    def __init__(
        self,
        provider: ProviderName,
        category: ErrorCategory,
        message: str,
        *,
        retryable: bool = True,
        retry_after_seconds: float | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.category = category
        self.retryable = retryable
        self.retry_after_seconds = retry_after_seconds
        self.status_code = status_code


class AISafetyRefusalError(AIProviderError):
    """Raised when a provider refuses a request for safety/policy reasons."""

    def __init__(self, provider: ProviderName, message: str) -> None:
        super().__init__(
            provider=provider,
            category=ErrorCategory.SAFETY_REFUSAL,
            message=message,
            retryable=False,
        )


class AIValidationError(AIGatewayError):
    """Raised when a provider output fails schema, evidence, or metric checks."""

    def __init__(
        self,
        reasons: list[str],
        *,
        unknown_evidence_ids: list[str] | None = None,
    ) -> None:
        self.reasons = reasons
        self.unknown_evidence_ids = unknown_evidence_ids or []
        super().__init__("; ".join(reasons))
