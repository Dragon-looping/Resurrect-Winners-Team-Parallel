"""Seeded historical SETUVYUHA logistics cases for case retrieval and steering."""

from __future__ import annotations

from app.cases.schemas import HistoricalCase

SEEDED_HISTORICAL_CASES: tuple[HistoricalCase, ...] = (
    HistoricalCase(
        case_id="CASE-MANIPAL-FAN-SPLIT-01",
        title="Manipal 50 Industrial Fans — Udupi 40/10 Split Fulfilment",
        description=(
            "Urgent order for 50 high-velocity 24-inch industrial pedestal fans (FAN-HV-24-IND) "
            "to Manipal Commercial Center by Friday. Udupi Central physical count adjusted stock to 40 units; "
            "resolved via split delivery: 40 fans Friday from Udupi Central and 10 fans Sunday from Mangalore Depot buffer."
        ),
        sku="FAN-HV-24-IND",
        category="industrial_fans",
        origin_hub="Udupi Central Warehouse",
        destination_hub="Manipal Commercial Center",
        quantity=50,
        resolution_type="split_delivery",
        outcome_summary="40 delivered Friday, 10 delivered Sunday via Mangalore buffer; zero exhibition downtime.",
        tags=["split_delivery", "urgent", "udupi", "manipal", "stock_shortage"],
    ),
    HistoricalCase(
        case_id="CASE-MANIPAL-FAN-LATER-02",
        title="Manipal 50 Industrial Fans — Later Consolidated Single Delivery",
        description=(
            "Commercial retail shop in Manipal requested 50 industrial pedestal fans all together. "
            "Customer declined split delivery and accepted consolidated single delivery of all 50 units on Tuesday "
            "once Udupi Central replenishment arrived from Bengaluru Hub."
        ),
        sku="FAN-HV-24-IND",
        category="industrial_fans",
        origin_hub="Udupi Central Warehouse",
        destination_hub="Manipal Commercial Center",
        quantity=50,
        resolution_type="later_single_delivery",
        outcome_summary="All 50 fans consolidated and delivered together on Tuesday in one manifest.",
        tags=["single_load", "later_consolidation", "udupi", "manipal"],
    ),
    HistoricalCase(
        case_id="CASE-MANIPAL-FAN-RECOVERY-03",
        title="Manipal 50 Industrial Fans — Emergency Inter-Hub Recovery Scan",
        description=(
            "Customer insisted on original Friday single-load deadline for 50 industrial fans despite Udupi count shortfall. "
            "Triggered emergency inter-hub recovery scan across Mangalore Depot and Bengaluru Hub to source remaining 10 units."
        ),
        sku="FAN-HV-24-IND",
        category="industrial_fans",
        origin_hub="Bengaluru Hub",
        destination_hub="Manipal Commercial Center",
        quantity=50,
        resolution_type="inter_hub_recovery",
        outcome_summary="Emergency inter-hub transfer initiated; missing stock verified honestly without false confirmation.",
        tags=["inter_hub_recovery", "single_load", "urgent", "bengaluru"],
    ),
    HistoricalCase(
        case_id="CASE-UDUPI-CLARIFY-DATE-04",
        title="Manipal Exhibition — Arrival vs Warehouse Dispatch Ambiguity",
        description=(
            "Customer requested 50 fans by Friday without specifying whether Friday meant arrival at Manipal receiving dock "
            "or dispatch release from Udupi warehouse. Inline clarification resolved arrival-by-Friday requirement."
        ),
        sku="FAN-HV-24-IND",
        category="industrial_fans",
        origin_hub="Udupi Central Warehouse",
        destination_hub="Manipal Commercial Center",
        quantity=50,
        resolution_type="clarification_resolved",
        outcome_summary="Clarified arrival-by-date semantics before issuing binding split schedule.",
        tags=["clarification", "ambiguity", "udupi", "manipal"],
    ),
    HistoricalCase(
        case_id="CASE-KUNDAPURA-PUMP-SPLIT-05",
        title="Kundapura 20 Submersible Pumps — Split Buffer Dispatch",
        description=(
            "Agricultural cooperative in Kundapura ordered 20 5HP submersible pumps (PMP-SUB-05-AGR) for urgent irrigation. "
            "Mangalore Depot staged 15 pumps immediately and routed 5 remaining pumps from Bengaluru Hub buffer."
        ),
        sku="PMP-SUB-05-AGR",
        category="agricultural_pumps",
        origin_hub="Mangalore Depot",
        destination_hub="Kundapura Agro Depot",
        quantity=20,
        resolution_type="split_delivery",
        outcome_summary="15 pumps delivered next day, 5 pumps delivered 48 hours later via coastal NH66.",
        tags=["split_delivery", "pumps", "kundapura", "mangalore", "urgent"],
    ),
    HistoricalCase(
        case_id="CASE-BRAHMAVAR-PUMP-STD-06",
        title="Brahmavar 12 Submersible Pumps — Standard Direct Fulfilment",
        description=(
            "Routine agricultural order for 12 submersible pumps (PMP-SUB-05-AGR) to Brahmavar Farm Supply. "
            "Full stock confirmed at Mangalore Depot; single direct truck dispatch completed on schedule."
        ),
        sku="PMP-SUB-05-AGR",
        category="agricultural_pumps",
        origin_hub="Mangalore Depot",
        destination_hub="Brahmavar Farm Supply",
        quantity=12,
        resolution_type="standard_fulfilment",
        outcome_summary="All 12 pumps fulfilled directly from Mangalore Depot with zero disruption.",
        tags=["standard", "pumps", "brahmavar", "mangalore"],
    ),
    HistoricalCase(
        case_id="CASE-MANGALORE-FAN-BULK-07",
        title="Mangalore Port Warehouse 100 Industrial Fans — Later Consolidated",
        description=(
            "Bulk order of 100 industrial pedestal fans for Mangalore port cold-storage facility. "
            "Strict single-load dock constraint; consolidated at Bengaluru Hub and dispatched via single heavy truck."
        ),
        sku="FAN-HV-24-IND",
        category="industrial_fans",
        origin_hub="Bengaluru Hub",
        destination_hub="Mangalore Port Terminal",
        quantity=100,
        resolution_type="later_single_delivery",
        outcome_summary="Consolidated 100-unit single load delivered within 4-day window.",
        tags=["bulk", "single_load", "later_consolidation", "bengaluru", "mangalore"],
    ),
    HistoricalCase(
        case_id="CASE-UDUPI-FAN-RECOVERY-08",
        title="Udupi Hospital Wing 30 Fans — Urgent Inter-Hub Transfer",
        description=(
            "Urgent ventilation requirement for 30 industrial fans at Udupi district clinic. "
            "Local stock depleted after physical audit; 30 units pulled from Mangalore Depot emergency reserve."
        ),
        sku="FAN-HV-24-IND",
        category="industrial_fans",
        origin_hub="Mangalore Depot",
        destination_hub="Udupi Central Warehouse",
        quantity=30,
        resolution_type="inter_hub_recovery",
        outcome_summary="Same-day coastal NH66 transfer from Mangalore Depot fulfilled urgent demand.",
        tags=["inter_hub_recovery", "urgent", "coastal", "udupi", "mangalore"],
    ),
    HistoricalCase(
        case_id="CASE-BENGALURU-PUMP-SPLIT-09",
        title="Bengaluru Peri-Urban 60 Submersible Pumps — Two-Wave Split",
        description=(
            "Large estate order of 60 agricultural submersible pumps with partial immediate requirement. "
            "40 pumps dispatched immediately from Bengaluru Hub; 20 pumps staged in second wave."
        ),
        sku="PMP-SUB-05-AGR",
        category="agricultural_pumps",
        origin_hub="Bengaluru Hub",
        destination_hub="Bengaluru East Estate",
        quantity=60,
        resolution_type="split_delivery",
        outcome_summary="Two-wave split reduced idle crew time while preserving full 60-unit allocation.",
        tags=["split_delivery", "bulk", "pumps", "bengaluru"],
    ),
    HistoricalCase(
        case_id="CASE-MANIPAL-PUMP-CLARIFY-10",
        title="Manipal Campus 15 Pumps — Missing Voltage & Single-Load Clarification",
        description=(
            "Ambiguous campus maintenance request for 15 pumps without SKU specification or single-load preference. "
            "Clarification confirmed PMP-SUB-05-AGR 5HP specification and allowed split delivery."
        ),
        sku="PMP-SUB-05-AGR",
        category="agricultural_pumps",
        origin_hub="Udupi Central Warehouse",
        destination_hub="Manipal Campus",
        quantity=15,
        resolution_type="clarification_resolved",
        outcome_summary="Resolved SKU ambiguity and confirmed split-tolerant delivery window.",
        tags=["clarification", "pumps", "manipal", "small_batch"],
    ),
)
