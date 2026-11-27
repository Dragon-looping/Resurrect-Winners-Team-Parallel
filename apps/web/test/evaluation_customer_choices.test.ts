import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureOrderAdapter, resetScenarioStore } from '../src/customer/adapters/orderAdapter.ts';

describe('PS3 Evaluation: Customer Choices Verification Suite (Checkpoint 7)', () => {
  let adapter: FixtureOrderAdapter;

  beforeEach(() => {
    resetScenarioStore();
    adapter = new FixtureOrderAdapter();
  });

  test('Choice 1 from reset: Customer accepts split delivery (40 Fri + 10 Sun)', async () => {
    const initial = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.equal(initial.state, 'offered');
    assert.equal(initial.offer?.type, 'split');
    assert.equal(initial.items[0].requestedQuantity, 50);

    const replied = await adapter.replyToOffer({
      orderId: 'ORD-2026-MANIPAL-50',
      decision: 'accept_split',
      expectedVersion: initial.version,
      clarificationAnswer: 'Accepted split offer: 40 on Friday + 10 on Sunday'
    });

    assert.equal(replied.state, 'confirmed');
    assert.equal(replied.version, initial.version + 1);
    assert.ok(replied.confirmedSchedule);
    assert.equal(replied.confirmedSchedule?.shipments.length, 2);
    assert.equal(replied.confirmedSchedule?.shipments[0].quantity, 40);
    assert.equal(replied.confirmedSchedule?.shipments[0].arrivalDate, '2026-11-27');
    assert.equal(replied.confirmedSchedule?.shipments[1].quantity, 10);
    assert.equal(replied.confirmedSchedule?.shipments[1].arrivalDate, '2026-11-29');

    // Confirm total equals requested 50
    const totalDelivered = replied.confirmedSchedule!.shipments.reduce((sum, s) => sum + s.quantity, 0);
    assert.equal(totalDelivered, 50);
  });

  test('Choice 2 from reset: Customer accepts later single delivery (50 Tue)', async () => {
    const initial = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.equal(initial.state, 'offered');

    const replied = await adapter.replyToOffer({
      orderId: 'ORD-2026-MANIPAL-50',
      decision: 'accept_later',
      expectedVersion: initial.version,
      clarificationAnswer: 'Accepted later single shipment: 50 on Tuesday'
    });

    assert.equal(replied.state, 'confirmed');
    assert.equal(replied.version, initial.version + 1);
    assert.ok(replied.confirmedSchedule);
    assert.equal(replied.confirmedSchedule?.shipments.length, 1);
    assert.equal(replied.confirmedSchedule?.shipments[0].quantity, 50);
    assert.equal(replied.confirmedSchedule?.shipments[0].arrivalDate, '2026-12-01');
  });

  test('Choice 3 from reset: Customer insists on original terms (All 50 Friday)', async () => {
    const initial = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.equal(initial.state, 'offered');

    const replied = await adapter.replyToOffer({
      orderId: 'ORD-2026-MANIPAL-50',
      decision: 'insist_original',
      expectedVersion: initial.version,
      clarificationAnswer: 'Must have all 50 units together by Friday 17:00'
    });

    // Insisting keeps order in recovery pending state without modifying promise
    assert.equal(replied.state, 'escalated');
    assert.equal(replied.version, initial.version + 1);
    assert.equal(replied.items[0].requestedQuantity, 50);
    assert.ok(replied.notes?.includes('Customer insisted'));
  });

  test('Repeatable reset: Successive cycles yield identical pristine state', async () => {
    // Cycle 1: Accept split
    const o1 = await adapter.getOrder('ORD-2026-MANIPAL-50');
    await adapter.replyToOffer({
      orderId: 'ORD-2026-MANIPAL-50',
      decision: 'accept_split',
      expectedVersion: o1.version
    });

    // Reset
    resetScenarioStore();

    // Cycle 2: Pristine state restored
    const o2 = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.equal(o2.state, 'offered');
    assert.equal(o2.version, o1.version);
    assert.equal(o2.confirmedSchedule, undefined);
  });
});
