import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureOrderAdapter, resetFixtureData } from '../src/customer/adapters/orderAdapter.ts';

describe('PS3 Evaluation: Customer Choices Verification Suite (Checkpoint 7)', () => {
  let adapter: FixtureOrderAdapter;

  beforeEach(() => {
    resetFixtureData();
    adapter = new FixtureOrderAdapter();
  });

  test('Choice 1 from reset: Customer accepts split delivery (40 Fri + 10 Sun)', async () => {
    const initial = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.equal(initial.status, 'offer_issued');
    assert.ok(initial.activeOffer);
    assert.equal(initial.activeOffer.offerType, 'split');
    assert.equal(initial.requestedDetails.quantity, 50);

    const updated = await adapter.replyToOffer(initial.orderId, {
      offerId: initial.activeOffer.offerId,
      offerVersion: initial.activeOffer.version,
      decision: 'accept_split'
    });

    assert.equal(updated.status, 'confirmed');
    assert.equal(updated.lastCustomerDecision, 'accept_split');
    assert.ok(updated.confirmedShipments);
    assert.equal(updated.confirmedShipments.length, 2);
    assert.equal(updated.confirmedShipments[0].quantity, 40);
    assert.equal(updated.confirmedShipments[0].arrivalDate, '2026-11-27');
    assert.equal(updated.confirmedShipments[1].quantity, 10);
    assert.equal(updated.confirmedShipments[1].arrivalDate, '2026-11-29');

    // Confirm total equals requested 50
    const totalDelivered = updated.confirmedShipments.reduce((sum, s) => sum + s.quantity, 0);
    assert.equal(totalDelivered, 50);
  });

  test('Choice 2 from reset: Customer accepts later single delivery (50 Tue)', async () => {
    const initial = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.equal(initial.status, 'offer_issued');
    assert.ok(initial.activeOffer);

    const updated = await adapter.replyToOffer(initial.orderId, {
      offerId: initial.activeOffer.offerId,
      offerVersion: initial.activeOffer.version,
      decision: 'accept_later'
    });

    assert.equal(updated.status, 'confirmed');
    assert.equal(updated.lastCustomerDecision, 'accept_later');
    assert.ok(updated.confirmedShipments);
    assert.equal(updated.confirmedShipments.length, 1);
    assert.equal(updated.confirmedShipments[0].quantity, 50);
    assert.equal(updated.confirmedShipments[0].arrivalDate, '2026-12-01');
  });

  test('Choice 3 from reset: Customer insists on original terms (All 50 Friday)', async () => {
    const initial = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.equal(initial.status, 'offer_issued');
    assert.ok(initial.activeOffer);

    const updated = await adapter.replyToOffer(initial.orderId, {
      offerId: initial.activeOffer.offerId,
      offerVersion: initial.activeOffer.version,
      decision: 'insist_original'
    });

    assert.equal(updated.status, 'recovery_pending');
    assert.equal(updated.lastCustomerDecision, 'insist_original');
    assert.equal(updated.requestedDetails.quantity, 50);
    assert.ok(updated.customerDelayReason?.includes('50 fans together by 2026-11-27'));
    assert.equal(updated.confirmedShipments, undefined);
  });

  test('Repeatable reset: Successive cycles yield identical pristine state', async () => {
    // Cycle 1: Accept split
    const o1 = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.ok(o1.activeOffer);
    await adapter.replyToOffer(o1.orderId, {
      offerId: o1.activeOffer.offerId,
      offerVersion: o1.activeOffer.version,
      decision: 'accept_split'
    });

    // Reset
    resetFixtureData();
    adapter = new FixtureOrderAdapter();

    // Cycle 2: Pristine state restored
    const o2 = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.equal(o2.status, 'offer_issued');
    assert.equal(o2.version, 1);
    assert.equal(o2.confirmedShipments, undefined);
    assert.ok(o2.activeOffer);
    assert.equal(o2.activeOffer.proposedShipments.length, 2);
  });
});
