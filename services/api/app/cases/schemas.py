"""Pydantic schemas for SETUVYUHA Case Steering and Similarity Retrieval (PS5)."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator


class HistoricalCase(BaseModel):
    """Immutable historical fulfilment/disruption case record."""

    case_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    sku: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    origin_hub: str = Field(..., min_length=1)
    destination_hub: str = Field(..., min_length=1)
    quantity: int = Field(..., ge=1)
    resolution_type: Literal[
        "split_delivery",
        "later_single_delivery",
        "inter_hub_recovery",
        "standard_fulfilment",
        "clarification_resolved",
    ]
    outcome_summary: str = Field(..., min_length=1)
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CaseSearchFilters(BaseModel):
    """Optional structured filters applied before/during ranking."""

    origin_hub: str | None = None
    destination_hub: str | None = None
    category: str | None = None
    resolution_type: str | None = None
    sku: str | None = None
    min_similarity: float | None = Field(default=None, ge=-1.0, le=1.0)


class CaseSearchRequest(BaseModel):
    """Request payload for POST /cases/search."""

    query: str = Field(..., description="Free-text case or fulfilment disruption query.")
    top_k: int = Field(default=5, ge=1, le=50)
    offset: int = Field(default=0, ge=0)
    filters: CaseSearchFilters | None = None
    steering_strength: float = Field(
        default=0.0,
        ge=-2.0,
        le=2.0,
        description="Steering strength in [-2.0, 2.0]. 0.0 disables steering.",
    )
    steering_direction: str | None = Field(
        default=None,
        description="Named steering preset (e.g., split_delivery, single_load, inter_hub_recovery, later_consolidation).",
    )
    steering_vector: list[float] | None = Field(
        default=None,
        description="Explicit steering vector matching the embedding dimension.",
    )
    target_case_id: str | None = Field(
        default=None,
        description="Optional historical case_id whose embedding serves as the steering direction.",
    )
    include_projection: bool = Field(
        default=True,
        description="Include fixed 2D scatter coordinates for visualization.",
    )

    @field_validator("steering_strength")
    @classmethod
    def _validate_finite_strength(cls, value: float) -> float:
        import math

        if not math.isfinite(value):
            raise ValueError("steering_strength must be a finite number.")
        return float(value)


class CaseProjectionPoint(BaseModel):
    """2D coordinate point for interactive scatter visualization."""

    case_id: str
    x: float
    y: float
    label: str
    category: str
    resolution_type: str
    is_query: bool = False
    is_steered_query: bool = False


class CaseSearchHit(BaseModel):
    """Single ranked historical case result with base and steered similarity."""

    case: HistoricalCase
    similarity_score: float = Field(..., ge=-1.0, le=1.0)
    base_similarity_score: float = Field(..., ge=-1.0, le=1.0)
    rank: int = Field(..., ge=1)
    base_rank: int = Field(..., ge=1)
    rank_delta: int = Field(
        ...,
        description="Positive means steering moved this case higher in rank (base_rank - rank).",
    )
    projection: CaseProjectionPoint | None = None


class SteeringPresetInfo(BaseModel):
    """Metadata describing an available steering direction preset."""

    id: str
    label: str
    description: str


class CaseSearchResponse(BaseModel):
    """Validated response payload for POST /cases/search."""

    query: str
    total_matches: int = Field(..., ge=0)
    offset: int = Field(..., ge=0)
    top_k: int = Field(..., ge=1)
    embedding_dimension: int = Field(..., ge=1)
    steering_applied: bool
    steering_strength: float
    steering_direction_label: str | None = None
    results: list[CaseSearchHit] = Field(default_factory=list)
    projection_points: list[CaseProjectionPoint] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
