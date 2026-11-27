import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FixturePlannerAdapter, resetPlannerFixtures } from '../src/planner/adapters/plannerAdapter.ts';

describe('Planner Workspace Tests (Branch 2)', () => {
  let adapter: FixturePlannerAdapter;

  beforeEach(() => {
    resetPlannerFixtures();
    adapter = new FixturePlannerAdapter();
  });

  // PT-01: Safe swap — cutoff 16:30 >= required 16:00 → feasible
  test('PT-01: Safe cutoff (16:30) for swap candidate returns feasible preview', async () => {
    const preview = await adapter.previewCutoffImpact('ORD-2026-MANIPAL-50', 'CAND-SWAP-MANGALORE', '16:30');
    assert.equal(preview.feasible, true);
    assert.equal(preview.isSavedPlanUnchanged, true);
    assert.ok(preview.outcomes.every(o => o.onTime));
  });

  // PT-02: Unsafe cutoff — 14:30 < required 16:00 → infeasible
  test('PT-02: Unsafe cutoff (14:30) for swap candidate returns infeasible preview with reason', async () => {
    const preview = await adapter.previewCutoffImpact('ORD-2026-MANIPAL-50', 'CAND-SWAP-MANGALORE', '14:30');
    assert.equal(preview.feasible, false);
    assert.ok(preview.unsafeReason && preview.unsafeReason.length > 0);
    assert.ok(preview.outcomes.some(o => !o.onTime));
    assert.equal(preview.isSavedPlanUnchanged, true);
  });

  // PT-03: Feasible approval succeeds, sets resolved status
  test('PT-03: Feasible approval resolves order', async () => {
    const order = await adapter.getOrder('ORD-2026-MANIPAL-50');
    const preview = await adapter.previewCutoffImpact('ORD-2026-MANIPAL-50', 'CAND-SWAP-MANGALORE', '16:30');
    const approved = await adapter.approveRecovery('ORD-2026-MANIPAL-50', 'CAND-SWAP-MANGALORE', order.version, preview);
    assert.equal(approved.riskStatus, 'resolved');
    assert.equal(approved.approvedCandidateId, 'CAND-SWAP-MANGALORE');
    assert.equal(approved.telemetry.backlogUnits, 0);
  });

  // PT-04: Infeasible candidate (CAND-WAIT-REPLENISH) blocks approval
  test('PT-04: Infeasible candidate blocks approval', async () => {
    const order = await adapter.getOrder('ORD-2026-MANIPAL-50');
    const preview = await adapter.previewCutoffImpact('ORD-2026-MANIPAL-50', 'CAND-WAIT-REPLENISH', '16:30');
    // Approval must throw — exact message comes from infeasibilityReason or unsafeReason
    await assert.rejects(
      async () => adapter.approveRecovery('ORD-2026-MANIPAL-50', 'CAND-WAIT-REPLENISH', order.version, preview),
      (err: any) => {
        assert.ok(err instanceof Error, 'Should throw an Error');
        return true; // Any Error is acceptable — candidate is infeasible
      }
    );
  });

  // PT-05: Unsafe cutoff preview blocks approval
  test('PT-05: Unsafe cutoff preview blocks approval', async () => {
    const order = await adapter.getOrder('ORD-2026-MANIPAL-50');
    const preview = await adapter.previewCutoffImpact('ORD-2026-MANIPAL-50', 'CAND-SWAP-MANGALORE', '14:30');
    assert.equal(preview.feasible, false, 'Preview at 14:30 must be infeasible');
    // Approval must throw — unsafe preview (previewResult.feasible === false)
    await assert.rejects(
      async () => adapter.approveRecovery('ORD-2026-MANIPAL-50', 'CAND-SWAP-MANGALORE', order.version, preview),
      (err: any) => {
        assert.ok(err instanceof Error, 'Should throw an Error');
        return true; // Any Error is acceptable — preview is infeasible
      }
    );
  });

  // PT-06: Stale version blocks approval
  test('PT-06: Stale order version blocks approval', async () => {
    await assert.rejects(
      async () => adapter.approveRecovery('ORD-2026-MANIPAL-50', 'CAND-SWAP-MANGALORE', 999),
      /stale|version/i
    );
  });

  // PT-07: Unavoidable delay on pump order (no feasible candidate)
  test('PT-07: Record unavoidable delay for pump shortage', async () => {
    const order = await adapter.getOrder('ORD-2026-BRAHMAVAR-20-PUMP');
    const updated = await adapter.recordUnavoidableDelay('ORD-2026-BRAHMAVAR-20-PUMP', 'No swap donor available for 0.5HP pumps', order.version);
    assert.equal(updated.riskStatus, 'unavoidable_delay');
    assert.ok(updated.unavoidableDelayNote?.includes('No swap donor'));
  });

  // PT-08: Customer tests still pass (verify isolation)
  test('PT-08: Planner store is isolated from customer scenario store', async () => {
    const list = await adapter.listOrders();
    assert.ok(list.some(o => o.orderId === 'ORD-2026-MANIPAL-50'));
    // Customer-only seeded order must not appear in planner list
    assert.ok(!list.some(o => o.orderId === 'ORD-2026-MANIPAL-CLARIFY'));
  });
});
