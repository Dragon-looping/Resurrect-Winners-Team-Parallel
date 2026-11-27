"""Strict response validation for AI Gateway outputs."""

from __future__ import annotations

import json
import math
import re
from typing import Any

from pydantic import ValidationError

from .providers.base import RawProviderResult
from .schemas import (
    AuthoritativeMetrics,
    ExpectedFieldType,
    GatewayRequest,
    ValidatedAIOutput,
    ValidationResult,
)

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_DISALLOWED_INVENTED_RECORD_KEYS = (
    "invented_inventory",
    "invented_records",
    "synthetic_orders",
    "synthetic_shipments",
)


class ResponseValidator:
    """Validates provider JSON structure, schema types, evidence IDs, and metrics."""

    def validate(
        self,
        request: GatewayRequest,
        raw_result: RawProviderResult,
    ) -> ValidationResult:
        """Validate raw provider text against structural and domain rules."""
        parsed = self._parse_json_object(raw_result.raw_text)
        if isinstance(parsed, str):
            return ValidationResult(valid=False, errors=[parsed])

        data_section = parsed.get("data")
        has_disallowed_top = any(key in parsed for key in _DISALLOWED_INVENTED_RECORD_KEYS)
        has_disallowed_nested = isinstance(data_section, dict) and any(
            key in data_section for key in _DISALLOWED_INVENTED_RECORD_KEYS
        )
        if has_disallowed_top or has_disallowed_nested:
            return ValidationResult(
                valid=False,
                errors=["AI output attempted to introduce disallowed synthetic records."],
            )

        try:
            output = ValidatedAIOutput.model_validate(parsed)
        except ValidationError as exc:
            errors = [
                f"Schema validation error at {'.'.join(str(p) for p in err['loc'])}: {err['msg']}"
                for err in exc.errors()
            ]
            return ValidationResult(valid=False, errors=errors)

        errors: list[str] = []
        unknown_ids: list[str] = []

        self._validate_required_fields(request, output, errors)
        self._validate_expected_schema(request, output, errors)
        self._validate_evidence_ids(request, output, errors, unknown_ids)
        self._validate_numeric_and_currency_fields(request, output, errors)

        if errors:
            return ValidationResult(
                valid=False,
                output=None,
                errors=errors,
                unknown_evidence_ids=unknown_ids,
            )

        return ValidationResult(valid=True, output=output)

    @staticmethod
    def _parse_json_object(raw_text: str) -> dict[str, Any] | str:
        cleaned = (raw_text or "").strip()
        if not cleaned:
            return "Provider returned empty response."
        if cleaned.startswith("```"):
            cleaned = _CODE_FENCE_RE.sub("", cleaned).strip()

        def _reject_non_finite(token: str) -> Any:
            raise ValueError(f"Non-finite numeric constant {token!r} is not allowed.")

        try:
            decoded = json.loads(cleaned, parse_constant=_reject_non_finite)
        except (json.JSONDecodeError, ValueError) as exc:
            msg = exc.msg if isinstance(exc, json.JSONDecodeError) else str(exc)
            return f"Provider returned malformed JSON: {msg}."
        if not isinstance(decoded, dict):
            return "Provider JSON root must be an object."
        return decoded

    @staticmethod
    def _resolve_field(output: ValidatedAIOutput, field_name: str) -> tuple[bool, Any]:
        if hasattr(output, field_name):
            return True, getattr(output, field_name)
        if field_name in output.data:
            return True, output.data[field_name]
        return False, None

    def _validate_required_fields(
        self,
        request: GatewayRequest,
        output: ValidatedAIOutput,
        errors: list[str],
    ) -> None:
        for field_name in request.required_fields:
            found, value = self._resolve_field(output, field_name)
            if not found or value is None or (isinstance(value, str) and not value.strip()):
                errors.append(f"Missing or empty required field: {field_name!r}.")

    def _validate_expected_schema(
        self,
        request: GatewayRequest,
        output: ValidatedAIOutput,
        errors: list[str],
    ) -> None:
        if not request.expected_schema:
            return
        for field_name, expected_type in request.expected_schema.items():
            found, value = self._resolve_field(output, field_name)
            if not found:
                errors.append(f"Missing field required by expected_schema: {field_name!r}.")
                continue
            if not _matches_expected_type(value, expected_type):
                errors.append(
                    f"Field {field_name!r} failed expected type {expected_type!r}."
                )

    @staticmethod
    def _validate_evidence_ids(
        request: GatewayRequest,
        output: ValidatedAIOutput,
        errors: list[str],
        unknown_ids: list[str],
    ) -> None:
        allowed_ids = {item.evidence_id for item in request.evidence}
        candidate_ids = list(output.cited_evidence_ids)

        extra_data_ids = output.data.get("cited_evidence_ids")
        if isinstance(extra_data_ids, list):
            candidate_ids.extend(str(item) for item in extra_data_ids)

        for evidence_id in candidate_ids:
            if evidence_id not in allowed_ids:
                if evidence_id not in unknown_ids:
                    unknown_ids.append(evidence_id)

        if unknown_ids:
            errors.append(
                f"Unknown evidence IDs cited by AI: {', '.join(unknown_ids)}."
            )

    @staticmethod
    def _validate_numeric_and_currency_fields(
        request: GatewayRequest,
        output: ValidatedAIOutput,
        errors: list[str],
    ) -> None:
        for key, qty in output.quantities.items():
            if isinstance(qty, bool) or not isinstance(qty, (int, float)) or not math.isfinite(qty):
                errors.append(f"Quantity field {key!r} must be a finite number.")
            elif qty < 0:
                errors.append(f"Quantity field {key!r} cannot be negative.")

        for key, amount in output.monetary_values.items():
            if (
                isinstance(amount, bool)
                or not isinstance(amount, (int, float))
                or not math.isfinite(amount)
            ):
                errors.append(f"Monetary field {key!r} must be a finite number.")

        if output.currency is not None:
            currency = output.currency.strip().upper()
            if len(currency) != 3 or not currency.isalpha():
                errors.append(
                    f"Currency {output.currency!r} must be a 3-letter ISO currency code."
                )

        if request.authoritative_metrics is not None:
            _enforce_authoritative_metrics(request.authoritative_metrics, output, errors)


def _enforce_authoritative_metrics(
    metrics: AuthoritativeMetrics,
    output: ValidatedAIOutput,
    errors: list[str],
) -> None:
    if output.currency is not None and output.currency.strip().upper() != metrics.currency:
        errors.append(
            f"AI currency {output.currency!r} conflicts with authoritative currency {metrics.currency!r}."
        )

    for key, ai_qty in output.quantities.items():
        if key in metrics.quantities:
            expected_qty = metrics.quantities[key]
            if abs(float(ai_qty) - float(expected_qty)) > 1e-6:
                errors.append(
                    f"AI attempted to override authoritative quantity {key!r} "
                    f"({ai_qty} != {expected_qty})."
                )
        elif not metrics.allow_ai_numeric_estimates:
            errors.append(
                f"AI invented unverified quantity {key!r} not present in authoritative metrics."
            )

    for key, ai_amount in output.monetary_values.items():
        if key in metrics.monetary_amounts:
            expected_amount = metrics.monetary_amounts[key]
            if abs(float(ai_amount) - float(expected_amount)) > 1e-4:
                errors.append(
                    f"AI attempted to override authoritative monetary value {key!r} "
                    f"({ai_amount} != {expected_amount})."
                )
        elif not metrics.allow_ai_numeric_estimates:
            errors.append(
                f"AI invented unverified monetary value {key!r} not present in authoritative metrics."
            )


def _matches_expected_type(value: Any, expected: ExpectedFieldType) -> bool:
    if expected == "str":
        return isinstance(value, str)
    if expected == "bool":
        return isinstance(value, bool)
    if expected == "int":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "float":
        return isinstance(value, float) and not isinstance(value, bool) and math.isfinite(value)
    if expected == "number":
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
        )
    if expected == "list":
        return isinstance(value, list)
    if expected == "dict":
        return isinstance(value, dict)
    return False
