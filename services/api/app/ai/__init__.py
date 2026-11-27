"""SETUVYUHA Centralized AI Gateway (Person 4 - Branch 1)."""

from .config import GatewayConfig, ProviderSettings, redact_secrets
from .exceptions import (
    AIConfigurationError,
    AIGatewayError,
    AIProviderError,
    AISafetyRefusalError,
    AIValidationError,
)
from .fallback import DeterministicFallbackService
from .gateway import AIGatewayService, create_default_gateway
from .health import ProviderHealthTracker
from .router import ai_router, get_ai_gateway
from .schemas import (
    AttemptTelemetry,
    AuthoritativeMetrics,
    ErrorCategory,
    EvidenceItem,
    ExecutionMode,
    GatewayHealthResponse,
    GatewayRequest,
    GatewayResponse,
    ProviderHealthSnapshot,
    ProviderName,
    TaskType,
    ValidatedAIOutput,
    ValidationResult,
)
from .validator import ResponseValidator

__all__ = [
    "AIConfigurationError",
    "AIGatewayError",
    "AIGatewayService",
    "AIProviderError",
    "AISafetyRefusalError",
    "AIValidationError",
    "AttemptTelemetry",
    "AuthoritativeMetrics",
    "DeterministicFallbackService",
    "ErrorCategory",
    "EvidenceItem",
    "ExecutionMode",
    "GatewayConfig",
    "GatewayHealthResponse",
    "GatewayRequest",
    "GatewayResponse",
    "ProviderHealthSnapshot",
    "ProviderHealthTracker",
    "ProviderName",
    "ProviderSettings",
    "ResponseValidator",
    "TaskType",
    "ValidatedAIOutput",
    "ValidationResult",
    "ai_router",
    "create_default_gateway",
    "get_ai_gateway",
    "redact_secrets",
]
