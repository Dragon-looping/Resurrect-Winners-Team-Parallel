"""Pydantic schemas for SETUVYUHA Ambiguity Detection & Clarification (PS6)."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class ClarificationRequest(BaseModel):
    """Request payload for POST /clarify.

    Supports both full natural-language + structured context ambiguity detection
    and P3's inline option-selection payload ({orderId, questionId, selectedOptionId}).
    """

    request_text: str = Field(
        default="",
        description="Free-text customer or operator logistics request.",
    )
    context: dict[str, Any] = Field(
        default_factory=dict,
        description="Already-known structured context parameters.",
    )
    sku: str | None = None
    item_name: str | None = None
    quantity: int | float | None = None
    unit: str | None = None
    destination: str | None = None
    requested_date: str | None = None
    date_meaning: Literal["arrival", "dispatch"] | None = None
    must_arrive_together: bool | None = None

    # Backward-compatible fields for P3 inline clarification selection
    orderId: str | None = None
    questionId: str | None = None
    selectedOptionId: str | None = None


class ClarificationOption(BaseModel):
    """Selectable option for a targeted clarification question."""

    id: str
    label: str
    description: str | None = None
    is_safe_default: bool = False


class ClarificationQuestion(BaseModel):
    """Targeted minimal clarification question."""

    question_id: str
    field: str
    priority: int = Field(..., ge=1)
    question_text: str
    reason: str
    options: list[ClarificationOption] = Field(default_factory=list)
    suggested_default: str | None = None


class SafeDefaultSuggestion(BaseModel):
    """Explicitly labeled safe-default suggestion (never presented as a confirmed fact)."""

    field: str
    suggested_value: Any
    label: str
    rationale: str
    is_suggestion: Literal[True] = True


class AmbiguityConflict(BaseModel):
    """Detected contradiction or invalid constraint in the request."""

    conflict_type: str
    description: str
    fields_involved: list[str] = Field(default_factory=list)


class ClarificationResponse(BaseModel):
    """Structured deterministic response for POST /clarify."""

    clarification_required: bool
    can_proceed: bool
    brief_explanation: str
    missing_required_fields: list[str] = Field(default_factory=list)
    conflicts: list[AmbiguityConflict] = Field(default_factory=list)
    questions: list[ClarificationQuestion] = Field(default_factory=list)
    safe_defaults: list[SafeDefaultSuggestion] = Field(default_factory=list)
    extracted_context: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(..., ge=0.0, le=1.0)
