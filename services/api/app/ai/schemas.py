"""Shared request, response, validation, and health schemas for the AI Gateway."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


class ProviderName(str, Enum):
    """Supported external AI providers."""

    GROQ = "groq"
    GEMINI = "gemini"


class ExecutionMode(str, Enum):
    """Indicates which runtime produced the gateway output."""

    GROQ = "groq"
    GEMINI = "gemini"
    DETERMINISTIC = "deterministic"


class TaskType(str, Enum):
    """Domain-neutral AI task categories supported by the gateway."""

    EXPLANATION = "explanation"
    DRAFT = "draft"
    SUMMARY = "summary"
    CLARIFICATION = "clarification"
    STRUCTURED_ANALYSIS = "structured_analysis"


class ErrorCategory(str, Enum):
    """Normalized provider and gateway failure classifications."""

    NONE = "none"
    AUTHENTICATION = "authentication"
    RATE_LIMIT = "rate_limit"
    TIMEOUT = "timeout"
    SERVER_ERROR = "server_error"
    CONNECTION_ERROR = "connection_error"
    VALIDATION_ERROR = "validation_error"
    SAFETY_REFUSAL = "safety_refusal"
    UNAVAILABLE = "unavailable"
    BAD_REQUEST = "bad_request"
    UNKNOWN = "unknown"


ExpectedFieldType = Literal["str", "int", "float", "number", "bool", "list", "dict"]


class EvidenceItem(BaseModel):
    """Authoritative backend evidence item supplied to ground AI output."""

    evidence_id: str = Field(..., min_length=1, max_length=128)
    source_type: str = Field(..., min_length=1, max_length=64)
    summary: str = Field(..., min_length=1, max_length=2000)
    authoritative_values: dict[str, Any] = Field(default_factory=dict)

    @field_validator("evidence_id", "source_type", "summary")
    @classmethod
    def _strip_non_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Field must not be blank.")
        return stripped


class AuthoritativeMetrics(BaseModel):
    """Factual calculation-engine outputs that AI must never override."""

    quantities: dict[str, int | float] = Field(default_factory=dict)
    monetary_amounts: dict[str, float] = Field(default_factory=dict)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    dates: dict[str, str] = Field(default_factory=dict)
    allow_ai_numeric_estimates: bool = False

    @field_validator("currency")
    @classmethod
    def _validate_currency_code(cls, value: str) -> str:
        code = value.strip().upper()
        if len(code) != 3 or not code.isalpha():
            raise ValueError("currency must be a 3-letter ISO currency code.")
        return code


class GatewayRequest(BaseModel):
    """Normalized request contract consumed by backend services."""

    request_id: str = Field(default_factory=lambda: str(uuid4()))
    task_type: TaskType | str = TaskType.EXPLANATION
    prompt: str = Field(..., min_length=1, max_length=16000)
    system_instruction: str | None = Field(default=None, max_length=4000)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    authoritative_metrics: AuthoritativeMetrics | None = None
    required_fields: list[str] = Field(default_factory=lambda: ["summary"])
    expected_schema: dict[str, ExpectedFieldType] | None = None
    preferred_provider: ProviderName | None = None
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    max_tokens: int = Field(default=512, ge=1, le=4096)
    has_completed_side_effect: bool = False
    is_ambiguous_instruction: bool = False
    clarification_options: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("request_id", "prompt")
    @classmethod
    def _validate_non_blank_str(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Value must not be blank.")
        return stripped

    @field_validator("task_type")
    @classmethod
    def _normalize_task_type(cls, value: TaskType | str) -> str:
        raw = value.value if isinstance(value, TaskType) else str(value).strip().lower()
        if not raw:
            raise ValueError("task_type must not be blank.")
        return raw


class ValidatedAIOutput(BaseModel):
    """Structured output returned by AI providers or deterministic fallback."""

    summary: str = Field(..., min_length=1)
    explanation: str | None = None
    cited_evidence_ids: list[str] = Field(default_factory=list)
    quantities: dict[str, int | float] = Field(default_factory=dict)
    monetary_values: dict[str, float] = Field(default_factory=dict)
    currency: str | None = None
    clarification_choices: list[str] = Field(default_factory=list)
    route_to_planner: bool = False
    data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("summary")
    @classmethod
    def _validate_summary_non_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("summary must not be blank.")
        return stripped


class ValidationResult(BaseModel):
    """Result returned by the response validation layer."""

    valid: bool
    output: ValidatedAIOutput | None = None
    errors: list[str] = Field(default_factory=list)
    unknown_evidence_ids: list[str] = Field(default_factory=list)


class AttemptTelemetry(BaseModel):
    """Per-provider execution details recorded during gateway routing."""

    provider: ProviderName
    model_id: str
    latency_ms: float = Field(..., ge=0.0)
    succeeded: bool
    error_category: ErrorCategory = ErrorCategory.NONE
    validation_passed: bool = False
    retry_after_seconds: float | None = Field(default=None, ge=0.0)
    detail: str | None = None


class GatewayResponse(BaseModel):
    """Normalized response contract returned to callers (P2, P3, future P4)."""

    request_id: str
    task_type: str
    execution_mode: ExecutionMode
    preferred_provider: ProviderName
    actual_provider: ProviderName | None = None
    model_id: str | None = None
    latency_ms: float = Field(..., ge=0.0)
    attempts: int = Field(..., ge=0)
    attempt_history: list[AttemptTelemetry] = Field(default_factory=list)
    error_category: ErrorCategory = ErrorCategory.NONE
    fallback_used: bool = False
    validation_status: Literal["passed", "rejected", "not_applicable"]
    service_status: Literal["healthy", "degraded", "fallback_only"]
    output: ValidatedAIOutput
    authoritative_metrics: AuthoritativeMetrics | None = None
    refused: bool = False
    warnings: list[str] = Field(default_factory=list)


class ProviderHealthSnapshot(BaseModel):
    """Health and cooldown state for a single provider."""

    provider: ProviderName
    configured: bool
    model_id: str | None = None
    healthy: bool
    in_cooldown: bool
    cooldown_remaining_seconds: float = Field(default=0.0, ge=0.0)
    consecutive_failures: int = Field(default=0, ge=0)
    last_error_category: ErrorCategory = ErrorCategory.NONE
    last_latency_ms: float | None = Field(default=None, ge=0.0)
    last_checked_at: datetime | None = None
    probe_due: bool = False
    configuration_errors: list[str] = Field(default_factory=list)


class GatewayHealthResponse(BaseModel):
    """Overall AI Gateway readiness and provider health status."""

    status: Literal["healthy", "degraded", "fallback_only"]
    primary_provider: ProviderName
    request_timeout_seconds: float
    provider_timeout_seconds: float
    checked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    providers: dict[str, ProviderHealthSnapshot]
