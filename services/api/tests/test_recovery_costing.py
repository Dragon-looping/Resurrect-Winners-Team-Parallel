"""Tests for wait-vs-recovery cost and margin floor calculations."""

from app.fulfilment.recovery.costing import evaluate_recovery_economics


def test_recovery_costing_accepts_profitable_and_rejects_below_margin_floor() -> None:
    """Verify economic evaluation accepts high-margin recovery and rejects below-floor options."""
    ok = evaluate_recovery_economics(
        quantity=20,
        freight_cost_per_unit=20.0,
        fixed_dispatch_cost=200.0,
        unit_selling_price=1000.0,
        unit_procurement_cost=600.0,
        wait_penalty_per_unit=250.0,
        margin_floor_pct=10.0,
    )
    assert ok.is_economically_feasible is True
    assert ok.net_benefit > 0
    assert ok.gross_margin_pct >= 10.0

    bad = evaluate_recovery_economics(
        quantity=10,
        freight_cost_per_unit=350.0,
        fixed_dispatch_cost=1000.0,
        unit_selling_price=1000.0,
        unit_procurement_cost=600.0,
        wait_penalty_per_unit=100.0,
        margin_floor_pct=10.0,
    )
    assert bad.is_economically_feasible is False
    assert any("margin floor" in r for r in bad.rejection_reasons)
    assert any("exceeds wait/penalty cost" in r for r in bad.rejection_reasons)
