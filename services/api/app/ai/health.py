"""Per-provider health, cooldown, and recovery probe tracking."""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from .schemas import ErrorCategory, ProviderHealthSnapshot, ProviderName


@dataclass
class _ProviderState:
    consecutive_failures: int = 0
    cooldown_until: float | None = None
    was_unhealthy: bool = False
    last_error_category: ErrorCategory = ErrorCategory.NONE
    last_latency_ms: float | None = None
    last_checked_at: datetime | None = None


class ProviderHealthTracker:
    """Tracks independent cooldowns and recovery probes for Groq and Gemini."""

    def __init__(self, clock: Callable[[], float] | None = None) -> None:
        self._clock = clock or time.monotonic
        self._states: dict[ProviderName, _ProviderState] = {
            ProviderName.GROQ: _ProviderState(),
            ProviderName.GEMINI: _ProviderState(),
        }

    def is_in_cooldown(self, provider: ProviderName) -> bool:
        state = self._states[provider]
        if state.cooldown_until is None:
            return False
        return self._clock() < state.cooldown_until

    def should_probe(self, provider: ProviderName) -> bool:
        """True when a previously failing provider's cooldown has elapsed."""
        state = self._states[provider]
        return (
            state.was_unhealthy
            and state.cooldown_until is not None
            and self._clock() >= state.cooldown_until
        )

    def cooldown_remaining_seconds(self, provider: ProviderName) -> float:
        state = self._states[provider]
        if state.cooldown_until is None:
            return 0.0
        return max(0.0, state.cooldown_until - self._clock())

    def record_success(self, provider: ProviderName, latency_ms: float) -> None:
        state = self._states[provider]
        state.consecutive_failures = 0
        state.cooldown_until = None
        state.was_unhealthy = False
        state.last_error_category = ErrorCategory.NONE
        state.last_latency_ms = latency_ms
        state.last_checked_at = datetime.now(timezone.utc)

    def record_failure(
        self,
        provider: ProviderName,
        category: ErrorCategory,
        latency_ms: float,
        *,
        retry_after_seconds: float | None = None,
        default_cooldown_seconds: float = 30.0,
    ) -> None:
        state = self._states[provider]
        state.last_error_category = category
        state.last_latency_ms = latency_ms
        state.last_checked_at = datetime.now(timezone.utc)

        if category == ErrorCategory.SAFETY_REFUSAL:
            # Safety refusals are request-specific, not provider outages.
            return

        state.consecutive_failures += 1

        if category == ErrorCategory.VALIDATION_ERROR and state.consecutive_failures < 2:
            # Allow one malformed response to fail over without immediately cooling down.
            return

        cooldown = (
            retry_after_seconds
            if retry_after_seconds is not None and retry_after_seconds > 0
            else default_cooldown_seconds
        )
        state.was_unhealthy = True
        state.cooldown_until = self._clock() + max(0.0, cooldown)

    def get_snapshot(
        self,
        provider: ProviderName,
        *,
        configured: bool,
        model_id: str | None,
        configuration_errors: list[str],
    ) -> ProviderHealthSnapshot:
        state = self._states[provider]
        in_cooldown = self.is_in_cooldown(provider)
        probe_due = self.should_probe(provider)
        healthy = configured and not in_cooldown and not state.was_unhealthy
        return ProviderHealthSnapshot(
            provider=provider,
            configured=configured,
            model_id=model_id,
            healthy=healthy,
            in_cooldown=in_cooldown,
            cooldown_remaining_seconds=round(self.cooldown_remaining_seconds(provider), 3),
            consecutive_failures=state.consecutive_failures,
            last_error_category=state.last_error_category,
            last_latency_ms=(
                round(state.last_latency_ms, 2) if state.last_latency_ms is not None else None
            ),
            last_checked_at=state.last_checked_at,
            probe_due=probe_due,
            configuration_errors=configuration_errors,
        )

    def reset(self) -> None:
        for provider in list(self._states.keys()):
            self._states[provider] = _ProviderState()
