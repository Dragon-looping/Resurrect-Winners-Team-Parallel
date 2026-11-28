"""Official Google Gemini SDK adapter for the SETUVYUHA AI Gateway."""

from __future__ import annotations

import asyncio
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


class GeminiAdapter(ProviderAdapter):
    """Adapter wrapping the official google-genai SDK with retries disabled."""

    provider_name = ProviderName.GEMINI

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
            from google import genai
            from google.genai import types
        except ImportError as exc:  # pragma: no cover - environment dependency guard
            raise AIConfigurationError(
                "The 'google-genai' package is required for Gemini integration. "
                "Install dependencies from services/api/requirements.txt."
            ) from exc

        timeout_ms = max(1, int(round(timeout_seconds * 1000)))
        # Gemini requires a server deadline of at least 10s. Keep the shorter
        # client timeout and asyncio deadline for gateway failover.
        http_kwargs: dict[str, Any] = {
            "timeout": timeout_ms,
            "headers": {"X-Server-Timeout": "10"},
        }
        if hasattr(types, "HttpRetryOptions"):
            http_kwargs["retry_options"] = types.HttpRetryOptions(attempts=1)
        return genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(**http_kwargs),
        )

    @staticmethod
    def _build_generate_config(request: GatewayRequest) -> Any:
        try:
            from google.genai import types

            return types.GenerateContentConfig(
                system_instruction=build_system_prompt(request),
                temperature=request.temperature,
                max_output_tokens=request.max_tokens,
                response_mime_type="application/json",
            )
        except ImportError:
            return {
                "system_instruction": build_system_prompt(request),
                "temperature": request.temperature,
                "max_output_tokens": request.max_tokens,
                "response_mime_type": "application/json",
            }

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

        try:
            client = self._client_factory(api_key, timeout_seconds)
            config = self._build_generate_config(request)
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model_id,
                    contents=build_user_prompt(request),
                    config=config,
                ),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError as exc:
            raise AIProviderError(
                ProviderName.GEMINI,
                ErrorCategory.TIMEOUT,
                f"Gemini request timed out after {timeout_seconds:.2f}s.",
                retryable=True,
            ) from exc
        except AISafetyRefusalError:
            raise
        except AIProviderError:
            raise
        except Exception as exc:
            raise self._map_sdk_exception(exc) from exc

        latency_ms = (time.perf_counter() - started) * 1000.0
        finish_reason = self._extract_finish_reason(response)
        block_reason = self._extract_block_reason(response)

        if block_reason or looks_like_safety_refusal(None, finish_reason):
            raise AISafetyRefusalError(
                ProviderName.GEMINI,
                "Gemini refused the request due to safety or policy rules.",
            )

        raw_text = (getattr(response, "text", None) or "").strip()
        if not raw_text:
            raw_text = self._extract_candidate_text(response)

        usage_meta = getattr(response, "usage_metadata", None)
        usage: dict[str, int] = {}
        if usage_meta is not None:
            for src, dest in (
                ("prompt_token_count", "prompt_tokens"),
                ("candidates_token_count", "completion_tokens"),
                ("total_token_count", "total_tokens"),
            ):
                val = getattr(usage_meta, src, None)
                if isinstance(val, int):
                    usage[dest] = val

        return RawProviderResult(
            provider=ProviderName.GEMINI,
            model_id=model_id,
            raw_text=raw_text,
            latency_ms=latency_ms,
            finish_reason=finish_reason,
            usage=usage,
        )

    @staticmethod
    def _extract_block_reason(response: Any) -> str | None:
        prompt_feedback = getattr(response, "prompt_feedback", None)
        if prompt_feedback is None:
            return None
        reason = getattr(prompt_feedback, "block_reason", None)
        if reason is None:
            return None
        reason_str = str(reason)
        if reason_str.upper() in ("", "NONE", "BLOCK_REASON_UNSPECIFIED"):
            return None
        return reason_str

    @staticmethod
    def _extract_finish_reason(response: Any) -> str | None:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return None
        reason = getattr(candidates[0], "finish_reason", None)
        return str(reason) if reason is not None else None

    @staticmethod
    def _extract_candidate_text(response: Any) -> str:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return ""
        content = getattr(candidates[0], "content", None)
        parts = getattr(content, "parts", None) or []
        chunks = [getattr(part, "text", "") for part in parts if getattr(part, "text", None)]
        return "\n".join(chunks).strip()

    def _map_sdk_exception(self, exc: Exception) -> AIProviderError:
        sanitized = self._sanitize_error(exc)
        status_code = getattr(exc, "code", None)
        if not isinstance(status_code, int):
            status_code = getattr(exc, "status_code", None)
        retry_after = extract_retry_after_seconds(exc)
        exc_name = type(exc).__name__

        if status_code in (401, 403) or "api_key_invalid" in sanitized.lower():
            return AIProviderError(
                ProviderName.GEMINI,
                ErrorCategory.AUTHENTICATION,
                f"Gemini authentication failed: {sanitized}",
                retryable=False,
                status_code=status_code,
            )
        if status_code == 429 or "resource_exhausted" in sanitized.lower():
            return AIProviderError(
                ProviderName.GEMINI,
                ErrorCategory.RATE_LIMIT,
                f"Gemini rate limit exceeded: {sanitized}",
                retryable=True,
                retry_after_seconds=retry_after,
                status_code=status_code or 429,
            )
        if isinstance(exc, TimeoutError) or status_code in (408, 504) or "Timeout" in exc_name:
            return AIProviderError(
                ProviderName.GEMINI,
                ErrorCategory.TIMEOUT,
                f"Gemini request timed out: {sanitized}",
                retryable=True,
                status_code=status_code,
            )
        if isinstance(exc, ConnectionError) or any(
            token in exc_name for token in ("Connect", "Network", "Transport")
        ):
            return AIProviderError(
                ProviderName.GEMINI,
                ErrorCategory.CONNECTION_ERROR,
                f"Gemini connection failed: {sanitized}",
                retryable=True,
            )
        if isinstance(status_code, int) and 500 <= status_code < 600:
            return AIProviderError(
                ProviderName.GEMINI,
                ErrorCategory.SERVER_ERROR,
                f"Gemini temporary server error: {sanitized}",
                retryable=True,
                retry_after_seconds=retry_after,
                status_code=status_code,
            )
        if status_code == 400 and looks_like_safety_refusal(sanitized):
            return AISafetyRefusalError(
                ProviderName.GEMINI,
                "Gemini refused the request due to safety or policy rules.",
            )

        category = classify_http_status(status_code) if isinstance(status_code, int) else ErrorCategory.UNKNOWN
        return AIProviderError(
            ProviderName.GEMINI,
            category,
            f"Gemini error: {sanitized}",
            retryable=category != ErrorCategory.BAD_REQUEST,
            retry_after_seconds=retry_after,
            status_code=status_code if isinstance(status_code, int) else None,
        )
