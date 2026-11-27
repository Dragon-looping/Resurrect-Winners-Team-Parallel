"""Health check routes for service readiness and liveness probes."""

from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health check",
    description="Returns the operational status and identifier of the SETUVYUHA API service.",
)
def health_check() -> HealthResponse:
    """Return a healthy status payload for the API service."""
    settings = get_settings()
    return HealthResponse(status="healthy", service=settings.service_name)
