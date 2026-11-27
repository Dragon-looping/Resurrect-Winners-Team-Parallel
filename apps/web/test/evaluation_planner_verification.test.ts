import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FixturePlannerAdapter, resetPlannerFixtures } from '../src/planner/adapters/plannerAdapter.ts';

describe('PS3 Evaluation: Planner Verification Suite (Checkpoint 8)', () => {
  let adapter: FixturePlannerAdapter;

  beforeEach(() => {
    resetPlannerFixtures();
    adapter = new FixturePlannerAdapter();
  });

  test('PV-01: Safe swap cutoff (16:30) returns feasible impact for BOTH orders', async () => {
    const orderId = 'ORD-2026-MANIPAL-50';
    const candidateId = 'CAND-SWAP-MANGALORE';

    const preview = await adapter.previewCutoffImpact(orderId, candidateId, '16:30');
    assert.equal(preview.feasible, true);
    assert.equal(preview.isSavedPlanUnchanged, true);
    assert.equal(preview.outcomes.length, 2);

    // Verify Primary Customer outcome
    const primaryOutcome = preview.outcomes.find(o => o.orderId === orderId);
    assert.ok(primaryOutcome);
    assert.equal(primaryOutcome.onTime, true);
    assert.equal(primaryOutcome.delayMinutes, 0);

    // Verify Donor Customer outcome
    const donorOutcome = preview.outcomes.find(o => o.orderId === 'ORD-2026-KUNDAPURA-30');
    assert.ok(donorOutcome);
    assert.equal(donorOutcome.onTime, true);
    assert.equal(donorOutcome.delayMinutes, 0);
  });

  test('PV-02: Unsafe cutoff change (14:30) reports reason for BOTH orders and blocks approval', async () => {
    const orderId = 'ORD-2026-MANIPAL-50';
    const candidateId = 'CAND-SWAP-MANGALORE';

    // 14:30 is 90 mins earlier than required 16:00
    const preview = await adapter.previewCutoffImpact(orderId, candidateId, '14:30');
    assert.equal(preview.feasible, false);
    assert.equal(preview.isSavedPlanUnchanged, true);
    assert.ok(preview.unsafeReason?.includes('14:30'));
    assert.ok(preview.unsafeReason?.includes('Manipal'));
    assert.ok(preview.unsafeReason?.includes('Kundapura'));

    // Check individual outcomes
    const primaryOutcome = preview.outcomes.find(o => o.orderId === orderId);
    assert.ok(primaryOutcome);
    assert.equal(primaryOutcome.onTime, false);
    assert.ok(primaryOutcome.delayMinutes > 0);

    const donorOutcome = preview.outcomes.find(o => o.orderId === 'ORD-2026-KUNDAPURA-30');
    assert.ok(donorOutcome);
    assert.equal(donorOutcome.onTime, false);

    // Approval must be rejected
    const order = await adapter.getOrder(orderId);
    await assert.rejects(
      async () => adapter.approveRecovery(orderId, candidateId, order.version, preview),
      (err: any) => err instanceof Error
    );
  });

  test('PV-03: Previews are strictly non-mutating (saved plan and donor stay unchanged)', async () => {
    const orderId = 'ORD-2026-MANIPAL-50';
    const donorId = 'ORD-2026-KUNDAPURA-30';

    const orderBefore = await adapter.getOrder(orderId);
    const donorBefore = await adapter.getOrder(donorId);

    // Run multiple simulations (safe and unsafe)
    await adapter.previewCutoffImpact(orderId, 'CAND-SWAP-MANGALORE', '16:45');
    await adapter.previewCutoffImpact(orderId, 'CAND-SWAP-MANGALORE', '13:00');
    await adapter.previewCutoffImpact(orderId, 'CAND-WAIT-REPLENISH', '17:00');

    const orderAfter = await adapter.getOrder(orderId);
    const donorAfter = await adapter.getOrder(donorId);

    assert.equal(orderAfter.version, orderBefore.version);
    assert.equal(orderAfter.riskStatus, orderBefore.riskStatus);
    assert.equal(orderAfter.telemetry.backlogUnits, orderBefore.telemetry.backlogUnits);
    assert.equal(orderAfter.telemetry.dispatchCutoff, orderBefore.telemetry.dispatchCutoff);
    assert.equal(donorAfter.version, donorBefore.version);
    assert.equal(donorAfter.riskStatus, donorBefore.riskStatus);
  });

  test('PV-04: Feasible approval updates status, increments version, and sets cutoff', async () => {
    const orderId = 'ORD-2026-MANIPAL-50';
    const candidateId = 'CAND-SWAP-MANGALORE';
    const initial = await adapter.getOrder(orderId);

    const safePreview = await adapter.previewCutoffImpact(orderId, candidateId, '16:30');
    const approved = await adapter.approveRecovery(orderId, candidateId, initial.version, safePreview);

    assert.equal(approved.riskStatus, 'resolved');
    assert.equal(approved.approvedCandidateId, candidateId);
    assert.equal(approved.version, initial.version + 1);
    assert.equal(approved.telemetry.backlogUnits, 0);
    assert.equal(approved.telemetry.dispatchCutoff, '16:30');
  });

  test('PV-05: Record unavoidable delay on pump shortage with explanation', async () => {
    const orderId = 'ORD-2026-BRAHMAVAR-20-PUMP';
    const initial = await adapter.getOrder(orderId);
    assert.equal(initial.riskStatus, 'critical_shortage');

    const updated = await adapter.recordUnavoidableDelay(
      orderId,
      'No donor inventory available within 60km. Central vendor shipment delayed.',
      initial.version
    );

    assert.equal(updated.riskStatus, 'unavoidable_delay');
    assert.equal(updated.version, initial.version + 1);
    assert.ok(updated.unavoidableDelayNote?.includes('Central vendor shipment delayed'));
  });
});
