"""Deterministic fallback templates when AI providers are unavailable or rejected."""

from __future__ import annotations

from .schemas import ErrorCategory, GatewayRequest, TaskType, ValidatedAIOutput

_DEFAULT_CLARIFICATION_CHOICES = [
    "Specify the target godown, SKU, and required quantity.",
    "Proceed with the deterministic fulfilment and cost engine.",
    "Route this instruction to the operational planner.",
]


class DeterministicFallbackService:
    """Produces transparent, grounded deterministic responses without fabricating facts."""

    def build_output(
        self,
        request: GatewayRequest,
        *,
        error_category: ErrorCategory,
        refused: bool = False,
        reason: str | None = None,
    ) -> ValidatedAIOutput:
        cited_ids = [item.evidence_id for item in request.evidence]
        metrics = request.authoritative_metrics
        quantities = dict(metrics.quantities) if metrics else {}
        monetary_values = dict(metrics.monetary_amounts) if metrics else {}
        currency = metrics.currency if metrics else None

        if refused or error_category == ErrorCategory.SAFETY_REFUSAL:
            return ValidatedAIOutput(
                summary=(
                    "Request was refused by AI safety policy; no alternative AI generation "
                    "was attempted."
                ),
                explanation=reason or "Safety refusal is terminal for this request.",
                cited_evidence_ids=cited_ids,
                quantities=quantities,
                monetary_values=monetary_values,
                currency=currency,
                clarification_choices=[],
                route_to_planner=False,
                data={
                    "execution_mode": "deterministic",
                    "service_status": "safety_refusal",
                    "authoritative_only": True,
                },
            )

        is_clarification = (
            request.is_ambiguous_instruction
            or request.task_type == TaskType.CLARIFICATION.value
        )
        clarification_choices = (
            list(request.clarification_options)
            if request.clarification_options
            else (_DEFAULT_CLARIFICATION_CHOICES if is_clarification else [])
        )

        if is_clarification:
            summary = (
                "AI providers are unavailable or skipped; select a structured clarification "
                "option or route directly to the deterministic planner."
            )
        else:
            summary = (
                f"Deterministic fallback active ({error_category.value}). "
                "Authoritative backend metrics and supplied evidence remain valid for "
                "stock, date, cost, and purchasing workflows."
            )

        evidence_notes = [
            f"[{item.evidence_id}] ({item.source_type}): {item.summary}"
            for item in request.evidence
        ]
        explanation_parts = [
            reason or f"Factual workflow preserved without AI drafting ({error_category.value})."
        ]
        if evidence_notes:
            explanation_parts.append("Supplied evidence: " + " | ".join(evidence_notes))

        return ValidatedAIOutput(
            summary=summary,
            explanation=" ".join(explanation_parts),
            cited_evidence_ids=cited_ids,
            quantities=quantities,
            monetary_values=monetary_values,
            currency=currency,
            clarification_choices=clarification_choices,
            route_to_planner=is_clarification,
            data={
                "execution_mode": "deterministic",
                "service_status": "fallback_only",
                "error_category": error_category.value,
                "authoritative_dates": dict(metrics.dates) if metrics else {},
                "authoritative_only": True,
            },
        )
