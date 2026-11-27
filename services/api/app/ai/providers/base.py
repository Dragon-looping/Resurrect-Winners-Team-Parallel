"""Base provider adapter contract and shared prompt/error helpers."""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from ..config import ProviderSettings, redact_secrets
from ..schemas import ErrorCategory, GatewayRequest, ProviderName

_SAFETY_KEYWORDS = (
    "safety",
    "policy",
    "content_filter",
    "prohibited",
    "refuse",
    "harmful",
)


@dataclass(frozen=True)
class RawProviderResult:
    """Normalized raw response produced by a provider adapter before validation."""

    provider: ProviderName
    model_id: str
    raw_text: str
    latency_ms: float
    finish_reason: str | None = None
    usage: dict[str, int] = field(default_factory=dict)


class ProviderAdapter(ABC):
    """Abstract adapter interface implemented by Groq and Gemini integrations."""

    provider_name: ProviderName

    def __init__(self, settings: ProviderSettings) -> None:
        self._settings = settings

    @property
    def model_id(self) -> str:
        return self._settings.model or ""

    @property
    def is_configured(self) -> bool:
        return self._settings.is_configured

    def configuration_errors(self) -> list[str]:
        return self._settings.configuration_errors()

    @abstractmethod
    async def generate(
        self,
        request: GatewayRequest,
        timeout_seconds: float,
    ) -> RawProviderResult:
        """Execute one non-retried completion attempt within timeout_seconds."""

    def _sanitize_error(self, exc: BaseException) -> str:
        secret = self._settings.raw_api_key
        secrets = (secret,) if secret else ()
        return redact_secrets(f"{type(exc).__name__}: {exc}", extra_secrets=secrets)


def build_system_prompt(request: GatewayRequest) -> str:
    """Build strict JSON grounding instructions shared across all providers."""
    allowed_ids = [item.evidence_id for item in request.evidence]
    base_rules = [
        "You are the SETUVYUHA backend AI drafting and explanation assistant.",
        "Return ONLY a single valid JSON object matching the required output schema.",
        (
            "Required JSON keys: summary (string), explanation (string or null), "
            "cited_evidence_ids (array of strings), quantities (object of numbers), "
            "monetary_values (object of numbers), currency (3-letter ISO code or null), "
            "clarification_choices (array of strings), route_to_planner (boolean), "
            "data (object)."
        ),
        f"Additional required fields from caller: {json.dumps(request.required_fields)}.",
        (
            "EVIDENCE GROUNDING RULE: You may ONLY cite evidence IDs from this exact list: "
            f"{json.dumps(allowed_ids)}. Never invent evidence IDs, inventory, stock, "
            "shipments, or orders."
        ),
        (
            "AUTHORITATIVE CALCULATION RULE: Never override, alter, or recalculate "
            "backend authoritative stock quantities, dates, costs, or profits."
        ),
    ]
    if request.expected_schema:
        base_rules.append(
            f"Expected field types inside output/data: {json.dumps(request.expected_schema)}."
        )
    if request.system_instruction:
        base_rules.append(f"Task instruction: {request.system_instruction.strip()}")
    return "\n".join(base_rules)


def build_user_prompt(request: GatewayRequest) -> str:
    """Serialize user prompt, supplied evidence, and authoritative metrics cleanly."""
    payload: dict[str, Any] = {
        "task_type": request.task_type,
        "prompt": request.prompt,
        "evidence": [item.model_dump() for item in request.evidence],
    }
    if request.authoritative_metrics is not None:
        payload["authoritative_metrics"] = request.authoritative_metrics.model_dump()
    if request.is_ambiguous_instruction:
        payload["is_ambiguous_instruction"] = True
        payload["clarification_options"] = request.clarification_options
    return json.dumps(payload, ensure_ascii=False)


def extract_retry_after_seconds(exc: BaseException) -> float | None:
    """Best-effort extraction of Retry-After delay (seconds) from SDK exceptions."""
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None) if response is not None else None
    if headers:
        for key in ("retry-after", "Retry-After", "x-ratelimit-reset-requests"):
            raw = headers.get(key)
            if raw is not None:
                parsed = _parse_retry_value(str(raw))
                if parsed is not None:
                    return parsed

    match = re.search(r"(?i)retry(?:_|\s|-)?after[:=\s]+([0-9]+(?:\.[0-9]+)?)\s*s?", str(exc))
    if match:
        return float(match.group(1))
    return None


def _parse_retry_value(raw: str) -> float | None:
    cleaned = raw.strip().lower()
    if cleaned.endswith("ms"):
        try:
            return max(0.0, float(cleaned[:-2]) / 1000.0)
        except ValueError:
            return None
    if cleaned.endswith("s"):
        cleaned = cleaned[:-1]
    try:
        value = float(cleaned)
        return max(0.0, value)
    except ValueError:
        return None


def classify_http_status(status_code: int | None) -> ErrorCategory:
    """Map HTTP status codes into normalized ErrorCategory values."""
    if status_code in (401, 403):
        return ErrorCategory.AUTHENTICATION
    if status_code == 429:
        return ErrorCategory.RATE_LIMIT
    if status_code in (408, 504):
        return ErrorCategory.TIMEOUT
    if status_code is not None and 500 <= status_code < 600:
        return ErrorCategory.SERVER_ERROR
    if status_code == 400:
        return ErrorCategory.BAD_REQUEST
    return ErrorCategory.UNKNOWN


def looks_like_safety_refusal(text: str | None, finish_reason: str | None = None) -> bool:
    """Detect whether a provider error or response indicates a safety/policy refusal."""
    if finish_reason:
        upper_reason = finish_reason.upper()
        if any(
            token in upper_reason
            for token in ("SAFETY", "RECITATION", "PROHIBITED", "BLOCKLIST", "CONTENT_FILTER")
        ):
            return True
    if text:
        lower_text = text.lower()
        return any(keyword in lower_text for keyword in _SAFETY_KEYWORDS)
    return False
