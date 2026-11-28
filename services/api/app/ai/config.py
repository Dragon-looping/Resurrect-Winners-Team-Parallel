"""Environment-driven configuration and secret redaction for the AI Gateway."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Iterable, Mapping

from pydantic import SecretStr

from .exceptions import AIConfigurationError
from .schemas import ProviderName

MAX_REQUEST_DEADLINE_SECONDS = 10.0
MAX_PROVIDER_TIMEOUT_SECONDS = 4.0

_SECRET_PATTERNS = (
    re.compile(r"gsk_[A-Za-z0-9_-]{8,}"),
    re.compile(r"AIza[A-Za-z0-9_-]{12,}"),
    re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._-]{8,}"),
    re.compile(r"(?i)((?:api[_-]?key|x-api-key|x-goog-api-key)\s*[:=]\s*)[^\s,;\"']+"),
)


def redact_secrets(text: str, extra_secrets: Iterable[str] = ()) -> str:
    """Scrub API keys and authorization tokens from error messages and logs."""
    if not text:
        return text
    sanitized = text
    for secret in extra_secrets:
        if secret and len(secret) >= 4:
            sanitized = sanitized.replace(secret, "[REDACTED]")
    for pattern in _SECRET_PATTERNS:
        if pattern.groups >= 1:
            sanitized = pattern.sub(r"\1[REDACTED]", sanitized)
        else:
            sanitized = pattern.sub("[REDACTED]", sanitized)
    return sanitized


@dataclass(frozen=True)
class ProviderSettings:
    """Configuration for a single AI provider."""

    provider: ProviderName
    api_key: SecretStr | None = None
    model: str | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self.raw_api_key and self.model and self.model.strip())

    @property
    def raw_api_key(self) -> str | None:
        if self.api_key is None:
            return None
        value = self.api_key.get_secret_value().strip()
        return value or None

    def configuration_errors(self) -> list[str]:
        """Return actionable, non-secret validation errors for missing settings."""
        prefix = self.provider.value.upper()
        errors: list[str] = []
        if not self.raw_api_key:
            errors.append(f"Missing {prefix}_API_KEY environment variable.")
        if not self.model or not self.model.strip():
            errors.append(f"Missing {prefix}_MODEL environment variable.")
        return errors

    def __repr__(self) -> str:
        return (
            f"ProviderSettings(provider={self.provider.value!r}, "
            f"model={self.model!r}, configured={self.is_configured})"
        )


@dataclass(frozen=True)
class GatewayConfig:
    """Validated AI Gateway configuration loaded from environment variables."""

    groq: ProviderSettings = field(
        default_factory=lambda: ProviderSettings(provider=ProviderName.GROQ)
    )
    gemini: ProviderSettings = field(
        default_factory=lambda: ProviderSettings(provider=ProviderName.GEMINI)
    )
    primary_provider: ProviderName = ProviderName.GROQ
    request_timeout_seconds: float = MAX_REQUEST_DEADLINE_SECONDS
    provider_timeout_seconds: float = MAX_PROVIDER_TIMEOUT_SECONDS
    cooldown_seconds: float = 30.0

    def __post_init__(self) -> None:
        if self.request_timeout_seconds <= 0:
            raise AIConfigurationError("AI_REQUEST_TIMEOUT must be greater than 0.")
        if self.request_timeout_seconds > MAX_REQUEST_DEADLINE_SECONDS:
            raise AIConfigurationError(
                f"AI_REQUEST_TIMEOUT cannot exceed {MAX_REQUEST_DEADLINE_SECONDS} seconds."
            )
        if self.provider_timeout_seconds <= 0:
            raise AIConfigurationError("AI_PROVIDER_TIMEOUT must be greater than 0.")
        # With only Gemini configured, an explicitly longer attempt can use
        # the time otherwise reserved for failover.
        attempt_limit = MAX_PROVIDER_TIMEOUT_SECONDS
        if self.primary_provider == ProviderName.GEMINI and self.gemini.is_configured and not self.groq.is_configured:
            attempt_limit = self.request_timeout_seconds
        if self.provider_timeout_seconds > attempt_limit:
            raise AIConfigurationError(
                f"AI_PROVIDER_TIMEOUT cannot exceed {attempt_limit} seconds."
            )
        if self.provider_timeout_seconds > self.request_timeout_seconds:
            raise AIConfigurationError(
                "AI_PROVIDER_TIMEOUT cannot exceed AI_REQUEST_TIMEOUT."
            )
        if self.cooldown_seconds < 0:
            raise AIConfigurationError("AI_PROVIDER_COOLDOWN_SECONDS must be >= 0.")

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "GatewayConfig":
        """Load and validate GatewayConfig from environment variables."""
        source = os.environ if env is None else env

        primary_raw = (source.get("AI_PRIMARY_PROVIDER") or "groq").strip().lower()
        try:
            primary_provider = ProviderName(primary_raw)
        except ValueError as exc:
            raise AIConfigurationError(
                f"Invalid AI_PRIMARY_PROVIDER {primary_raw!r}. Expected 'groq' or 'gemini'."
            ) from exc

        request_timeout = _parse_float(
            source.get("AI_REQUEST_TIMEOUT"),
            default=MAX_REQUEST_DEADLINE_SECONDS,
            var_name="AI_REQUEST_TIMEOUT",
        )
        provider_timeout = _parse_float(
            source.get("AI_PROVIDER_TIMEOUT"),
            default=MAX_PROVIDER_TIMEOUT_SECONDS,
            var_name="AI_PROVIDER_TIMEOUT",
        )
        cooldown_seconds = _parse_float(
            source.get("AI_PROVIDER_COOLDOWN_SECONDS"),
            default=30.0,
            var_name="AI_PROVIDER_COOLDOWN_SECONDS",
        )

        groq_key = _to_secret(source.get("GROQ_API_KEY"))
        groq_model = _clean_str(source.get("GROQ_MODEL"))
        gemini_key = _to_secret(source.get("GEMINI_API_KEY"))
        gemini_model = _clean_str(source.get("GEMINI_MODEL"))

        return cls(
            groq=ProviderSettings(
                provider=ProviderName.GROQ,
                api_key=groq_key,
                model=groq_model,
            ),
            gemini=ProviderSettings(
                provider=ProviderName.GEMINI,
                api_key=gemini_key,
                model=gemini_model,
            ),
            primary_provider=primary_provider,
            request_timeout_seconds=request_timeout,
            provider_timeout_seconds=provider_timeout,
            cooldown_seconds=cooldown_seconds,
        )

    def get_provider_settings(self, provider: ProviderName) -> ProviderSettings:
        return self.groq if provider == ProviderName.GROQ else self.gemini

    def secret_values(self) -> tuple[str, ...]:
        secrets: list[str] = []
        for settings in (self.groq, self.gemini):
            if settings.raw_api_key:
                secrets.append(settings.raw_api_key)
        return tuple(secrets)

    def validate_startup(self, *, require_at_least_one: bool = False) -> list[str]:
        """Collect configuration warnings/errors; optionally raise if none configured."""
        issues = [
            *self.groq.configuration_errors(),
            *self.gemini.configuration_errors(),
        ]
        if require_at_least_one and not (
            self.groq.is_configured or self.gemini.is_configured
        ):
            raise AIConfigurationError(
                "No AI provider is configured. " + " ".join(issues)
            )
        return issues


def _clean_str(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _to_secret(value: str | None) -> SecretStr | None:
    cleaned = _clean_str(value)
    return SecretStr(cleaned) if cleaned else None


def _parse_float(raw: str | None, *, default: float, var_name: str) -> float:
    cleaned = _clean_str(raw)
    if cleaned is None:
        return default
    try:
        return float(cleaned)
    except ValueError as exc:
        raise AIConfigurationError(
            f"Invalid numeric value for {var_name}: {cleaned!r}."
        ) from exc
