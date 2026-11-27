"""Health check routes for service readiness and liveness probes."""

from fastapi import APIRouter, Response, status

from app.core.config import get_settings
from app.core.database import check_database_connectivity
from app.schemas.health import HealthResponse, ReadinessResponse

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse | ReadinessResponse,
    summary="Service health check",
    description="Verifies API liveness and database connectivity; returns 503 if the database is unreachable.",
)
def health_check(response: Response) -> HealthResponse | ReadinessResponse:
    """Return healthy only when the required database is reachable."""
    settings = get_settings()
    ok, error_detail = check_database_connectivity()
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(
            status="unavailable",
            service=settings.service_name,
            database="unreachable",
            detail=error_detail,
        )
    return HealthResponse(status="healthy", service=settings.service_name)


@router.get(
    "/health/live",
    response_model=HealthResponse,
    summary="Service liveness probe",
    description="Returns 200 when the FastAPI process is alive without checking external dependencies.",
)
def liveness_check() -> HealthResponse:
    """Return process liveness status."""
    settings = get_settings()
    return HealthResponse(status="healthy", service=settings.service_name)


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    summary="Database readiness probe",
    description="Verifies PostgreSQL connectivity using SELECT 1 without exposing credentials.",
)
def readiness_check(response: Response) -> ReadinessResponse:
    """Return 200 when PostgreSQL is reachable, or 503 otherwise."""
    settings = get_settings()
    ok, error_detail = check_database_connectivity()
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(
            status="unavailable",
            service=settings.service_name,
            database="unreachable",
            detail=error_detail,
        )
    return ReadinessResponse(
        status="ready",
        service=settings.service_name,
        database="connected",
    )
