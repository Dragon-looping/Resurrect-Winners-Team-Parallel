"""SETUVYUHA Case Steering & Similarity Retrieval package (P4 Branch 2)."""

from app.cases.corpus import SEEDED_HISTORICAL_CASES
from app.cases.embeddings import (
    EMBEDDING_DIM,
    STEERING_PRESETS,
    EmbeddingResult,
    LocalEmbeddingEngine,
    cosine_similarity,
    l2_normalize,
    validate_embedding_vector,
)
from app.cases.projection import Fixed2DProjector
from app.cases.router import cases_router, get_case_service
from app.cases.schemas import (
    CaseProjectionPoint,
    CaseSearchFilters,
    CaseSearchHit,
    CaseSearchRequest,
    CaseSearchResponse,
    HistoricalCase,
    SteeringPresetInfo,
)
from app.cases.service import CaseSteeringService

__all__ = [
    "EMBEDDING_DIM",
    "STEERING_PRESETS",
    "SEEDED_HISTORICAL_CASES",
    "EmbeddingResult",
    "LocalEmbeddingEngine",
    "Fixed2DProjector",
    "CaseSteeringService",
    "CaseProjectionPoint",
    "CaseSearchFilters",
    "CaseSearchHit",
    "CaseSearchRequest",
    "CaseSearchResponse",
    "HistoricalCase",
    "SteeringPresetInfo",
    "cases_router",
    "get_case_service",
    "cosine_similarity",
    "l2_normalize",
    "validate_embedding_vector",
]
