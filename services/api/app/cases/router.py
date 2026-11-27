"""FastAPI router for Case Steering and Similarity Retrieval (PS5)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.cases.schemas import (
    CaseSearchRequest,
    CaseSearchResponse,
    HistoricalCase,
    SteeringPresetInfo,
)
from app.cases.service import CaseSteeringService

cases_router = APIRouter(prefix="/cases", tags=["cases"])

_default_case_service = CaseSteeringService()


def get_case_service() -> CaseSteeringService:
    """Dependency provider for CaseSteeringService (overridable in tests)."""
    return _default_case_service


@cases_router.post(
    "/search",
    response_model=CaseSearchResponse,
    summary="Search historical logistics cases with optional vector steering",
)
def search_cases(
    request: CaseSearchRequest,
    service: CaseSteeringService = Depends(get_case_service),
) -> CaseSearchResponse:
    """Retrieve ranked similar cases, similarity scores, and fixed 2D projection coordinates."""
    try:
        return service.search(request)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc


@cases_router.get(
    "/presets",
    response_model=list[SteeringPresetInfo],
    summary="List available vector steering direction presets",
)
def list_steering_presets(
    service: CaseSteeringService = Depends(get_case_service),
) -> list[SteeringPresetInfo]:
    """Return available named steering directions for interactive UI controls."""
    return service.list_steering_presets()


@cases_router.get(
    "",
    response_model=list[HistoricalCase],
    summary="List indexed historical fulfilment cases",
)
def list_historical_cases(
    service: CaseSteeringService = Depends(get_case_service),
) -> list[HistoricalCase]:
    """Return all historical cases currently indexed in the local corpus."""
    return service.list_cases()
