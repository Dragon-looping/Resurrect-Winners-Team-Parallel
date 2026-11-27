"""FastAPI router for Ambiguity Detection and Clarification (PS6)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.clarification.detector import AmbiguityDetectorService
from app.clarification.schemas import ClarificationRequest, ClarificationResponse

clarification_router = APIRouter(tags=["clarification"])

_default_detector = AmbiguityDetectorService()


def get_clarification_service() -> AmbiguityDetectorService:
    """Dependency provider for AmbiguityDetectorService (overridable in tests)."""
    return _default_detector


@clarification_router.post(
    "/clarify",
    response_model=ClarificationResponse,
    summary="Detect ambiguity and generate minimal targeted clarification questions",
)
def clarify_request(
    request: ClarificationRequest,
    service: AmbiguityDetectorService = Depends(get_clarification_service),
) -> ClarificationResponse:
    """Analyze a logistics request for missing essential fields or conflicts deterministically."""
    return service.analyze(request)
