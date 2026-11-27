"""Official Groq SDK adapter for the SETUVYUHA AI Gateway."""

from __future__ import annotations

import asyncio
import inspect
import time
from typing import Any, Callable

from ..config import ProviderSettings
from ..exceptions import AIConfigurationError, AIProviderError, AISafetyRefusalError
from ..schemas import ErrorCategory, GatewayRequest, ProviderName
from .base import (
    ProviderAdapter,
    RawProviderResult,
    build_system_prompt,
    build_user_prompt,
    classify_http_status,
    extract_retry_after_seconds,
    looks_like_safety_refusal,
)


class GroqAdapter(ProviderAdapter):
    """Adapter wrapping the official async Groq Python SDK with retries disabled."""

    provider_name = ProviderName.GROQ

    def __init__(
        self,
        settings: ProviderSettings,
        *,
        client_factory: Callable[[str, float], Any] | None = None,
    ) -> None:
        super().__init__(settings)
        self._client_factory = client_factory or self._default_client_factory

    @staticmethod
    def _default_client_factory(api_key: str, timeout_seconds: float) -> Any:
        try:
            from groq import AsyncGroq
        except ImportError as exc:  # pragma: no cover - environment dependency guard
            raise AIConfigurationError(
                "The 'groq' package is required for Groq integration. "
                "Install dependencies from services/api/requirements.txt."
            ) from exc
        # Disable SDK retries so single-attempt and request deadlines are strictly respected.
        return AsyncGroq(api_key=api_key, timeout=timeout_seconds, max_retries=0)

    async def generate(
        self,
        request: GatewayRequest,
        timeout_seconds: float,
    ) -> RawProviderResult:
        if not self.is_configured:
            raise AIConfigurationError(" ".join(self.configuration_errors()))

        api_key = self._settings.raw_api_key or ""
        model_id = self.model_id
        started = time.perf_counter()

        client = None
        try:
            client = self._client_factory(api_key, timeout_seconds)
            completion = await asyncio.wait_for(
                client.chat.completions.create(
                    model=model_id,
                    messages=[
                        {"role": "system", "content": build_system_prompt(request)},
                        {"role": "user", "content": build_user_prompt(request)},
                    ],
                    temperature=request.temperature,
                    max_tokens=request.max_tokens,
                    response_format={"type": "json_object"},
                ),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError as exc:
            raise AIProviderError(
                ProviderName.GROQ,
                ErrorCategory.TIMEOUT,
                f"Groq request timed out after {timeout_seconds:.2f}s.",
                retryable=True,
            ) from exc
        except AISafetyRefusalError:
            raise
        except AIProviderError:
            raise
        except Exception as exc:
            raise self._map_sdk_exception(exc) from exc
        finally:
            await self._close_client(client)

        latency_ms = (time.perf_counter() - started) * 1000.0
        choice = completion.choices[0] if getattr(completion, "choices", None) else None
        message = getattr(choice, "message", None)
        finish_reason = getattr(choice, "finish_reason", None)
        refusal_text = getattr(message, "refusal", None)
        raw_text = (getattr(message, "content", None) or "").strip()

        if refusal_text or looks_like_safety_refusal(None, finish_reason):
            raise AISafetyRefusalError(
                ProviderName.GROQ,
                "Groq refused the request due to safety or policy rules.",
            )

        usage_obj = getattr(completion, "usage", None)
        usage: dict[str, int] = {}
        if usage_obj is not None:
            for field_name in ("prompt_tokens", "completion_tokens", "total_tokens"):
                val = getattr(usage_obj, field_name, None)
                if isinstance(val, int):
                    usage[field_name] = val

        return RawProviderResult(
            provider=ProviderName.GROQ,
            model_id=getattr(completion, "model", None) or model_id,
            raw_text=raw_text,
            latency_ms=latency_ms,
            finish_reason=str(finish_reason) if finish_reason is not None else None,
            usage=usage,
        )

    @staticmethod
    async def _close_client(client: Any) -> None:
        if client is None:
            return
        close_fn = getattr(client, "close", None) or getattr(client, "aclose", None)
        if not callable(close_fn):
            return
        try:
            result = close_fn()
            if inspect.isawaitable(result):
                await result
        except Exception:
            pass

    def _map_sdk_exception(self, exc: Exception) -> AIProviderError:
        sanitized = self._sanitize_error(exc)
        status_code = getattr(exc, "status_code", None)
        retry_after = extract_retry_after_seconds(exc)
        exc_name = type(exc).__name__

        if exc_name == "AuthenticationError" or status_code in (401, 403):
            return AIProviderError(
                ProviderName.GROQ,
                ErrorCategory.AUTHENTICATION,
                f"Groq authentication failed: {sanitized}",
                retryable=False,
                status_code=status_code,
            )
        if exc_name == "RateLimitError" or status_code == 429:
            return AIProviderError(
                ProviderName.GROQ,
                ErrorCategory.RATE_LIMIT,
                f"Groq rate limit exceeded: {sanitized}",
                retryable=True,
                retry_after_seconds=retry_after,
                status_code=status_code or 429,
            )
        if exc_name == "APITimeoutError" or isinstance(exc, TimeoutError):
            return AIProviderError(
                ProviderName.GROQ,
                ErrorCategory.TIMEOUT,
                f"Groq request timed out: {sanitized}",
                retryable=True,
                status_code=status_code,
            )
        if exc_name == "APIConnectionError" or isinstance(exc, ConnectionError):
            return AIProviderError(
                ProviderName.GROQ,
                ErrorCategory.CONNECTION_ERROR,
                f"Groq connection failed: {sanitized}",
                retryable=True,
            )
        if exc_name == "InternalServerError" or (
            isinstance(status_code, int) and 500 <= status_code < 600
        ):
            return AIProviderError(
                ProviderName.GROQ,
                ErrorCategory.SERVER_ERROR,
                f"Groq temporary server error: {sanitized}",
                retryable=True,
                retry_after_seconds=retry_after,
                status_code=status_code,
            )
        if status_code == 400 and looks_like_safety_refusal(sanitized):
            return AISafetyRefusalError(
                ProviderName.GROQ,
                "Groq refused the request due to safety or policy rules.",
            )

        category = classify_http_status(status_code) if status_code else ErrorCategory.UNKNOWN
        return AIProviderError(
            ProviderName.GROQ,
            category,
            f"Groq error: {sanitized}",
            retryable=category != ErrorCategory.BAD_REQUEST,
            retry_after_seconds=retry_after,
            status_code=status_code,
        )
