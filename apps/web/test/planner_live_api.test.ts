import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LiveApiPlannerAdapter } from '../src/planner/adapters/plannerAdapter.ts';

const LIVE_API_BASE = 'http://127.0.0.1:8000';

describe('Planner Live API Integration Suite', () => {
  const adapter = new LiveApiPlannerAdapter(LIVE_API_BASE);

  test('PL-01: listOrders() loads real orders from FastAPI backend', async () => {
    const orders = await adapter.listOrders();
    assert.ok(Array.isArray(orders), 'Orders should be an array');
    assert.ok(orders.length > 0, 'Orders array should not be empty');
    const order10 = orders.find(o => o.orderId === '10');
    assert.ok(order10, 'Live order queue should include Order ID 10');
    assert.equal(order10.quantity, 50);
  });

  test('PL-02: getOrder("10") opens order 10 and reloading returns the same record', async () => {
    const order = await adapter.getOrder('10');
    assert.equal(order.orderId, '10');
    assert.equal(order.quantity, 50);
    assert.ok(order.customerLabel.includes('Manipal Commercial Center'));
    assert.equal(order.itemSku, 'FAN-IND-400-BLDC');

    // Reloading the same order
    const reloaded = await adapter.getOrder('10');
    assert.equal(reloaded.orderId, order.orderId);
    assert.equal(reloaded.quantity, order.quantity);
    assert.equal(reloaded.itemSku, order.itemSku);
  });

  test('PL-03: getOrder can resolve by order number ORD-2026-MNP-6488', async () => {
    const order = await adapter.getOrder('ORD-2026-MNP-6488');
    assert.equal(order.orderId, '10');
    assert.equal(order.quantity, 50);
  });

  test('PL-04: Supported recovery preview on test order computes feasible and unsafe cutoff impacts', async () => {
    // 1. Safe cutoff 16:30 >= required 16:00
    const safePreview = await adapter.previewCutoffImpact('10', 'CAND-10-SWAP', '16:30');
    assert.equal(safePreview.feasible, true, 'Cutoff 16:30 should be feasible');
    assert.equal(safePreview.isSavedPlanUnchanged, true);
    assert.ok(safePreview.outcomes.length >= 2, 'Should contain outcomes for both affected orders');
    assert.equal(safePreview.outcomes[0].orderId, '10');
    assert.equal(safePreview.outcomes[0].onTime, true);

    // 2. Unsafe cutoff 14:30 < required 16:00
    const unsafePreview = await adapter.previewCutoffImpact('10', 'CAND-10-SWAP', '14:30');
    assert.equal(unsafePreview.feasible, false, 'Cutoff 14:30 should be infeasible');
    assert.equal(unsafePreview.isSavedPlanUnchanged, true);
    assert.ok(unsafePreview.unsafeReason?.includes('Plant 2 requires (16:00)'));
    assert.equal(unsafePreview.outcomes[0].onTime, false);
  });

  test('PL-05: Unsupported recovery actions throw clear unavailable errors', async () => {
    // Rejection is unavailable on live fulfilment backend
    await assert.rejects(
      async () => adapter.rejectRecovery('10', 'Planner rejected proposal', 1),
      /Recovery rejection is unavailable on the live fulfilment backend/i
    );

    // Unavoidable delay is unavailable on live backend
    await assert.rejects(
      async () => adapter.recordUnavoidableDelay('10', 'Delayed due to stockout', 1),
      /Recording unavoidable delay is unavailable on the live backend/i
    );

    // Purchase order creation is unavailable in live mode
    await assert.rejects(
      async () => adapter.createPurchaseOrder('10', 'Chief Planner'),
      /Purchase Order generation is unavailable in Live mode/i
    );

    // Supplier dispatch email is unavailable in live mode
    await assert.rejects(
      async () => adapter.sendSupplierEmail('10', 'Chief Planner'),
      /Supplier dispatch email is unavailable in Live mode/i
    );
  });

  test('PL-06: Queue failure throws descriptive error', async () => {
    const brokenAdapter = new LiveApiPlannerAdapter('http://127.0.0.1:9999');
    await assert.rejects(
      async () => brokenAdapter.listOrders(),
      /Failed to load order queue from live backend/i
    );
  });
});
