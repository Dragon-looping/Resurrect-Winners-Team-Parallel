"""Deterministic ambiguity detection and minimal clarification generator (PS6).

Runs 100% locally without paid LLM calls. Distinguishes essential vs optional
fields, detects contradictions, avoids re-asking already-supplied parameters,
and marks safe defaults explicitly as suggestions.
"""

from __future__ import annotations

import math
import re
from typing import Any

from app.clarification.schemas import (
    AmbiguityConflict,
    ClarificationOption,
    ClarificationQuestion,
    ClarificationRequest,
    ClarificationResponse,
    SafeDefaultSuggestion,
)

MAX_QUESTIONS = 4

_KNOWN_SKUS = {
    "FAN-HV-24-IND": ("High-Velocity 24\" Industrial Pedestal Fans", "units"),
    "PMP-SUB-05-AGR": ("5HP Submersible Agricultural Pumps", "units"),
}

_PRODUCT_PATTERNS: tuple[tuple[re.Pattern[str], str, str], ...] = (
    (re.compile(r"\bfan-hv-24-ind\b|\b(?:industrial\s+)?(?:pedestal\s+)?fans?\b", re.I), "FAN-HV-24-IND", "units"),
    (re.compile(r"\bpmp-sub-05-agr\b|\b(?:submersible\s+)?(?:agricultural\s+)?pumps?\b", re.I), "PMP-SUB-05-AGR", "units"),
    (re.compile(r"\b(?:cables?|pipes?|motors?|generators?|inverters?|valves?|compressors?|panels?)\b", re.I), "CUSTOM-ITEM", "units"),
)

_DEST_RE = re.compile(
    r"\b(?:manipal|udupi|mangalore|bengaluru|bangalore|kundapura|brahmavar|hubballi|mysuru|kochi)\b",
    re.I,
)
_TO_DEST_RE = re.compile(
    r"\b(?:to|for|at)\s+([A-Z][a-zA-Z0-9\s#-]{2,32}?)(?=\s+(?:by|on|before|after|via|with|urgent|split|$)|[,.]|$)"
)
_QTY_UNIT_RE = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*(units?|pcs|pieces|fans?|pumps?|boxes?|cartons?|sets?|kg|tons?|liters?|litres?|l|nos?)\b",
    re.I,
)
_BARE_QTY_RE = re.compile(r"(?:^|\s)(?:need|send|ship|deliver|order|require|want)\s+(\d+)\b", re.I)
_ISO_DATE_RE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
_REL_DATE_RE = re.compile(
    r"\b(today|tomorrow|tonight|friday|saturday|sunday|monday|tuesday|wednesday|thursday|next\s+week|this\s+week|urgent|asap|eod|end\s+of\s+week)\b",
    re.I,
)
_ARRIVAL_MEANING_RE = re.compile(r"\b(arrive|arrival|delivered\s+at|receiving\s+dock|at\s+site|on\s+site|by\s+dock)\b", re.I)
_DISPATCH_MEANING_RE = re.compile(r"\b(dispatch|leave\s+warehouse|shipped\s+from|release\s+from)\b", re.I)
_SINGLE_LOAD_RE = re.compile(r"\b(all\s+together|single\s+load|single\s+delivery|strict\s+single|no\s+split|cannot\s+split|must\s+arrive\s+together)\b", re.I)
_SPLIT_OK_RE = re.compile(r"\b(split\s+(?:ok|okay|allowed|acceptable|delivery\s+ok|fine)|partial\s+ok|staged\s+delivery)\b", re.I)
_VAGUE_INTENT_RE = re.compile(
    r"^\s*(?:help|hello|hi|test|check|need\s+help|send\s+some\s+items?|deliver\s+soon|urgent\s+order|order\s+please)\s*[.!?]*\s*$",
    re.I,
)


class AmbiguityDetectorService:
    """Deterministic ambiguity detection & minimal clarification question service."""

    def analyze(self, request: ClarificationRequest) -> ClarificationResponse:
        """Analyze request + context and return structured clarification guidance."""
        # Backward compatibility for P3 inline option reply
        if request.orderId and request.questionId and request.selectedOptionId and not request.request_text.strip():
            return ClarificationResponse(
                clarification_required=False,
                can_proceed=True,
                brief_explanation=(
                    f"Inline clarification option '{request.selectedOptionId}' recorded for "
                    f"question '{request.questionId}' on order '{request.orderId}'."
                ),
                missing_required_fields=[],
                conflicts=[],
                questions=[],
                safe_defaults=[],
                extracted_context={
                    "orderId": request.orderId,
                    "questionId": request.questionId,
                    "selectedOptionId": request.selectedOptionId,
                },
                confidence=1.0,
            )

        text = (request.request_text or "").strip()
        ctx = dict(request.context or {})

        extracted: dict[str, Any] = {}
        conflicts: list[AmbiguityConflict] = []
        missing_fields: list[str] = []
        questions: list[ClarificationQuestion] = []
        safe_defaults: list[SafeDefaultSuggestion] = []

        # 1. Extract / merge Product or SKU
        sku = request.sku or ctx.get("sku") or ctx.get("itemSku")
        item_name = request.item_name or ctx.get("item_name") or ctx.get("itemName")
        inferred_unit: str | None = None

        if not sku and text:
            for pattern, matched_sku, default_unit in _PRODUCT_PATTERNS:
                match = pattern.search(text)
                if match:
                    if matched_sku in _KNOWN_SKUS:
                        sku = matched_sku
                        item_name = item_name or _KNOWN_SKUS[matched_sku][0]
                    else:
                        item_name = item_name or match.group(0).strip()
                    inferred_unit = default_unit
                    break

        if sku:
            extracted["sku"] = str(sku).strip()
        if item_name:
            extracted["item_name"] = str(item_name).strip()

        # 2. Extract / merge Quantity and Unit
        qty = request.quantity if request.quantity is not None else ctx.get("quantity")
        unit = request.unit or ctx.get("unit") or inferred_unit
        text_qty: float | None = None
        text_unit: str | None = None

        if text:
            m_qty = _QTY_UNIT_RE.search(text)
            if m_qty:
                text_qty = float(m_qty.group(1))
                text_unit = m_qty.group(2).lower()
            else:
                m_bare = _BARE_QTY_RE.search(text)
                if m_bare:
                    text_qty = float(m_bare.group(1))

        if qty is not None and text_qty is not None and abs(float(qty) - text_qty) > 1e-6:
            conflicts.append(
                AmbiguityConflict(
                    conflict_type="quantity_mismatch",
                    description=(
                        f"Structured quantity ({qty}) conflicts with quantity mentioned in text ({int(text_qty) if text_qty.is_integer() else text_qty})."
                    ),
                    fields_involved=["quantity"],
                )
            )
        if qty is None and text_qty is not None:
            qty = int(text_qty) if text_qty.is_integer() else text_qty
        if not unit and text_unit:
            unit = text_unit

        if qty is not None:
            if isinstance(qty, bool) or not math.isfinite(float(qty)) or float(qty) <= 0:
                conflicts.append(
                    AmbiguityConflict(
                        conflict_type="invalid_quantity",
                        description=f"Quantity must be a positive number (received {qty}).",
                        fields_involved=["quantity"],
                    )
                )
            else:
                extracted["quantity"] = int(qty) if float(qty).is_integer() else float(qty)
        if unit:
            extracted["unit"] = unit

        # 3. Extract / merge Destination
        destination = request.destination or ctx.get("destination")
        if not destination and text:
            m_dest = _DEST_RE.search(text)
            if m_dest:
                destination = m_dest.group(0).strip().title()
            else:
                m_to = _TO_DEST_RE.search(text)
                if m_to:
                    candidate = m_to.group(1).strip()
                    if candidate.lower() not in {"today", "tomorrow", "friday", "urgent"}:
                        destination = candidate
        if destination:
            extracted["destination"] = str(destination).strip()

        # 4. Extract / merge Timeframe & Date Meaning
        req_date = request.requested_date or ctx.get("requested_date") or ctx.get("requestedArrivalDate")
        if not req_date and text:
            m_iso = _ISO_DATE_RE.search(text)
            if m_iso:
                req_date = m_iso.group(1)
            else:
                m_rel = _REL_DATE_RE.search(text)
                if m_rel:
                    req_date = m_rel.group(1).strip()
        if req_date:
            extracted["requested_date"] = str(req_date).strip()

        date_meaning = request.date_meaning or ctx.get("date_meaning")
        if not date_meaning and text:
            has_arr = bool(_ARRIVAL_MEANING_RE.search(text))
            has_disp = bool(_DISPATCH_MEANING_RE.search(text))
            if has_arr and has_disp:
                conflicts.append(
                    AmbiguityConflict(
                        conflict_type="date_meaning_conflict",
                        description="Request mentions both arrival at destination and warehouse dispatch for the same deadline.",
                        fields_involved=["date_meaning", "requested_date"],
                    )
                )
            elif has_arr:
                date_meaning = "arrival"
            elif has_disp:
                date_meaning = "dispatch"
        if date_meaning:
            extracted["date_meaning"] = date_meaning

        # 5. Check single-load vs split-delivery contradictions
        has_single_text = bool(text and _SINGLE_LOAD_RE.search(text))
        has_split_text = bool(text and _SPLIT_OK_RE.search(text))
        if has_single_text and has_split_text:
            conflicts.append(
                AmbiguityConflict(
                    conflict_type="delivery_mode_conflict",
                    description="Request simultaneously requires single-load delivery and permits split delivery.",
                    fields_involved=["must_arrive_together"],
                )
            )
        elif request.must_arrive_together is True and has_split_text:
            conflicts.append(
                AmbiguityConflict(
                    conflict_type="delivery_mode_conflict",
                    description="Structured flag must_arrive_together=True conflicts with split-delivery permission in text.",
                    fields_involved=["must_arrive_together"],
                )
            )
        elif request.must_arrive_together is False and has_single_text:
            conflicts.append(
                AmbiguityConflict(
                    conflict_type="delivery_mode_conflict",
                    description="Structured flag must_arrive_together=False conflicts with single-load requirement in text.",
                    fields_involved=["must_arrive_together"],
                )
            )
        elif request.must_arrive_together is not None:
            extracted["must_arrive_together"] = request.must_arrive_together
        elif has_single_text:
            extracted["must_arrive_together"] = True
        elif has_split_text:
            extracted["must_arrive_together"] = False

        # 6. Identify essential missing fields (distinguishing essential vs optional)
        has_product = bool(extracted.get("sku") or extracted.get("item_name"))
        has_qty = "quantity" in extracted
        has_dest = bool(extracted.get("destination"))
        has_date = bool(extracted.get("requested_date"))

        # Check unclear/empty intent
        if not text and not any((has_product, has_qty, has_dest, has_date)):
            missing_fields.extend(["product_or_sku", "quantity", "destination", "requested_date"])
        elif text and _VAGUE_INTENT_RE.match(text) and not any((has_product, has_qty, has_dest)):
            missing_fields.extend(["product_or_sku", "quantity", "destination"])
        else:
            if not has_product:
                missing_fields.append("product_or_sku")
            if not has_qty:
                missing_fields.append("quantity")
            if not has_dest:
                missing_fields.append("destination")
            # Timeframe is essential when missing in a dispatch request OR when date is ambiguous
            if not has_date:
                missing_fields.append("requested_date")

        # Date meaning ambiguity: when a date/deadline IS provided (e.g. "by Friday"),
        # and text contains "by <date>" / "ambiguous" without specifying arrival vs dispatch,
        # flag date_meaning only if no other major fields are missing or it's explicitly deadline-sensitive
        date_phrase_ambiguous = bool(
            has_date
            and not date_meaning
            and (
                re.search(r"\bby\s+(?:friday|monday|tuesday|wednesday|thursday|saturday|sunday|tomorrow|20\d{2}-\d{2}-\d{2})\b", text, re.I)
                or "ambiguous" in text.lower()
            )
        )
        if date_phrase_ambiguous and "date_meaning" not in missing_fields:
            missing_fields.append("date_meaning")

        # 7. Build minimal targeted questions (prioritized, never asking for supplied fields)
        priority = 1

        for conflict in conflicts:
            if len(questions) >= MAX_QUESTIONS:
                break
            if conflict.conflict_type == "delivery_mode_conflict":
                questions.append(
                    ClarificationQuestion(
                        question_id="Q-CONFLICT-DELIVERY-MODE",
                        field="must_arrive_together",
                        priority=priority,
                        question_text="Your request mentions both single-load and split delivery. Which fulfilment rule should apply?",
                        reason=conflict.description,
                        options=[
                            ClarificationOption(
                                id="allow_split",
                                label="Allow split delivery if primary hub has partial stock",
                                description="Dispatches available stock immediately and routes balance from buffer hub.",
                                is_safe_default=True,
                            ),
                            ClarificationOption(
                                id="strict_single",
                                label="Require single consolidated delivery only",
                                description="Holds dispatch until full quantity can travel together.",
                            ),
                        ],
                        suggested_default="allow_split",
                    )
                )
                safe_defaults.append(
                    SafeDefaultSuggestion(
                        field="must_arrive_together",
                        suggested_value=False,
                        label="Allow split delivery (Suggestion)",
                        rationale="Prevents blocking partial immediate dispatch when regional stock is split.",
                    )
                )
                priority += 1
            elif conflict.conflict_type in {"quantity_mismatch", "invalid_quantity"}:
                questions.append(
                    ClarificationQuestion(
                        question_id="Q-CONFLICT-QUANTITY",
                        field="quantity",
                        priority=priority,
                        question_text="Please confirm the exact positive order quantity required.",
                        reason=conflict.description,
                    )
                )
                priority += 1
            elif conflict.conflict_type == "date_meaning_conflict":
                questions.append(
                    ClarificationQuestion(
                        question_id="Q-CONFLICT-DATE-MEANING",
                        field="date_meaning",
                        priority=priority,
                        question_text="Does the target date refer to arrival at the destination dock or warehouse dispatch?",
                        reason=conflict.description,
                        options=[
                            ClarificationOption(
                                id="arrival",
                                label="Arrival at destination dock by target date",
                                is_safe_default=True,
                            ),
                            ClarificationOption(
                                id="dispatch",
                                label="Dispatch release from origin warehouse on target date",
                            ),
                        ],
                        suggested_default="arrival",
                    )
                )
                priority += 1

        if "product_or_sku" in missing_fields and len(questions) < MAX_QUESTIONS:
            questions.append(
                ClarificationQuestion(
                    question_id="Q-MISSING-PRODUCT",
                    field="product_or_sku",
                    priority=priority,
                    question_text="Which product or SKU should be fulfilled (e.g., FAN-HV-24-IND industrial fans or PMP-SUB-05-AGR pumps)?",
                    reason="No recognizable product, material, or SKU was specified.",
                    options=[
                        ClarificationOption(id="FAN-HV-24-IND", label="FAN-HV-24-IND · Industrial Pedestal Fans"),
                        ClarificationOption(id="PMP-SUB-05-AGR", label="PMP-SUB-05-AGR · 5HP Submersible Pumps"),
                    ],
                )
            )
            priority += 1

        if "quantity" in missing_fields and len(questions) < MAX_QUESTIONS:
            questions.append(
                ClarificationQuestion(
                    question_id="Q-MISSING-QUANTITY",
                    field="quantity",
                    priority=priority,
                    question_text="How many units are required (please specify quantity and unit)?",
                    reason="Order quantity is essential to allocate hub inventory and transport.",
                )
            )
            priority += 1

        if "destination" in missing_fields and len(questions) < MAX_QUESTIONS:
            questions.append(
                ClarificationQuestion(
                    question_id="Q-MISSING-DESTINATION",
                    field="destination",
                    priority=priority,
                    question_text="Where should the shipment be delivered (city, hub, or receiving address)?",
                    reason="Destination is required to select the optimal regional warehouse.",
                )
            )
            priority += 1

        if "requested_date" in missing_fields and len(questions) < MAX_QUESTIONS:
            questions.append(
                ClarificationQuestion(
                    question_id="Q-MISSING-DATE",
                    field="requested_date",
                    priority=priority,
                    question_text="What is the target delivery date or timeframe?",
                    reason="A target timeframe is needed to schedule dispatch and buffer transfers.",
                    options=[
                        ClarificationOption(
                            id="next_business_window",
                            label="Standard 48-hour regional fulfilment window",
                            is_safe_default=True,
                        ),
                    ],
                    suggested_default="next_business_window",
                )
            )
            safe_defaults.append(
                SafeDefaultSuggestion(
                    field="requested_date",
                    suggested_value="standard_48h_window",
                    label="Standard 48-hour regional window (Suggestion)",
                    rationale="Suggested only if no hard event or exhibition deadline applies.",
                )
            )
            priority += 1

        if "date_meaning" in missing_fields and len(questions) < MAX_QUESTIONS:
            questions.append(
                ClarificationQuestion(
                    question_id="Q-DATE-MEANING-01",
                    field="date_meaning",
                    priority=priority,
                    question_text=f"For target date '{extracted.get('requested_date')}', should goods arrive at {extracted.get('destination', 'the destination')} by then, or leave the warehouse by then?",
                    reason="Arrival-at-dock vs warehouse-dispatch changes whether split or buffer routing is needed.",
                    options=[
                        ClarificationOption(
                            id="arrival",
                            label=f"Arrive at destination dock by {extracted.get('requested_date')}",
                            description="Ensures on-site availability by the target date.",
                            is_safe_default=True,
                        ),
                        ClarificationOption(
                            id="dispatch",
                            label=f"Leave origin warehouse on {extracted.get('requested_date')}",
                            description="Allows transit after the target date.",
                        ),
                    ],
                    suggested_default="arrival",
                )
            )
            safe_defaults.append(
                SafeDefaultSuggestion(
                    field="date_meaning",
                    suggested_value="arrival",
                    label="Assume arrival at destination dock (Suggestion)",
                    rationale="Conservative default for deadline-bound customer requests; confirm before binding dispatch.",
                )
            )
            priority += 1

        clarification_required = bool(missing_fields or conflicts)
        can_proceed = not clarification_required

        if not clarification_required:
            brief_explanation = (
                "All essential fulfilment details (product, quantity, destination, timeframe) "
                "are clear and consistent. Ready to proceed."
            )
            confidence = 0.96
        else:
            parts: list[str] = []
            if conflicts:
                parts.append(f"{len(conflicts)} conflicting requirement(s) detected")
            if missing_fields:
                parts.append(f"missing essential field(s): {', '.join(missing_fields)}")
            brief_explanation = f"Clarification required: {'; '.join(parts)}."
            confidence = max(0.25, round(0.85 - 0.15 * (len(missing_fields) + len(conflicts)), 2))

        return ClarificationResponse(
            clarification_required=clarification_required,
            can_proceed=can_proceed,
            brief_explanation=brief_explanation,
            missing_required_fields=missing_fields,
            conflicts=conflicts,
            questions=questions,
            safe_defaults=safe_defaults,
            extracted_context=extracted,
            confidence=confidence,
        )
