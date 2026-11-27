"""Deterministic wait-versus-recovery cost and margin floor calculations."""

from dataclasses import dataclass

from app.core.config import get_settings


@dataclass(frozen=True, slots=True)
class CostEvaluation:
    """Economic evaluation of wait cost vs godown recovery cost and margin floor."""

    wait_cost: float
    recovery_cost: float
    net_benefit: float
    gross_margin_pct: float
    margin_floor_pct: float
    is_economically_feasible: bool
    rejection_reasons: list[str]


def evaluate_recovery_economics(
    *,
    quantity: int,
    freight_cost_per_unit: float,
    fixed_dispatch_cost: float,
    unit_selling_price: float = 1000.0,
    unit_procurement_cost: float = 600.0,
    wait_penalty_per_unit: float = 250.0,
    margin_floor_pct: float | None = None,
) -> CostEvaluation:
    """Calculate wait-vs-recovery costs and enforce the configurable margin floor."""
    floor = (
        margin_floor_pct
        if margin_floor_pct is not None
        else get_settings().recovery_margin_floor_pct
    )

    total_revenue = unit_selling_price * quantity
    freight_total = fixed_dispatch_cost + (freight_cost_per_unit * quantity)
    procurement_total = unit_procurement_cost * quantity

    # Wait cost includes lost margin/penalty on late delivery
    wait_cost = round(wait_penalty_per_unit * quantity + procurement_total, 2)
    recovery_cost = round(freight_total + procurement_total, 2)
    net_benefit = round(wait_cost - recovery_cost, 2)
    gross_margin_pct = (
        round(((total_revenue - recovery_cost) / total_revenue) * 100.0, 2)
        if total_revenue > 0
        else 0.0
    )

    reasons: list[str] = []
    if gross_margin_pct < floor:
        reasons.append(
            f"Gross margin {gross_margin_pct:.2f}% is below configured margin floor {floor:.2f}%."
        )
    if net_benefit < 0:
        reasons.append(
            f"Recovery cost ({recovery_cost:.2f}) exceeds wait/penalty cost ({wait_cost:.2f}); net_benefit={net_benefit:.2f}."
        )

    return CostEvaluation(
        wait_cost=wait_cost,
        recovery_cost=recovery_cost,
        net_benefit=net_benefit,
        gross_margin_pct=gross_margin_pct,
        margin_floor_pct=floor,
        is_economically_feasible=len(reasons) == 0,
        rejection_reasons=reasons,
    )
