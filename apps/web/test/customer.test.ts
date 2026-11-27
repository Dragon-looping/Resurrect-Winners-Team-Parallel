import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureOrderAdapter, resetFixtureData } from '../src/customer/adapters/orderAdapter.ts';
import { SEEDED_SCENARIOS } from '../src/customer/fixtures/scenarios.ts';

describe('Customer Portal Logistics Tests (Branch 1)', () => {
  let adapter: FixtureOrderAdapter;

  beforeEach(() => {
    resetFixtureData();
    adapter = new FixtureOrderAdapter();
  });

  test('TC-01: Seeded Scenarios integrity', async () => {
    const splitOrder = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.equal(splitOrder.orderId, 'ORD-2026-MANIPAL-50');
    assert.equal(splitOrder.status, 'offer_issued');
    assert.equal(splitOrder.activeOffer?.offerType, 'split');
    assert.equal(splitOrder.activeOffer?.proposedShipments.length, 2);
    assert.equal(splitOrder.activeOffer?.proposedShipments[0].quantity, 40);
    assert.equal(splitOrder.activeOffer?.proposedShipments[1].quantity, 10);
  });

  test('TC-02: Choice 1 - Accept Split Delivery (40 Fri + 10 Sun)', async () => {
    const order = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.ok(order.activeOffer);

    const updated = await adapter.replyToOffer(order.orderId, {
      offerId: order.activeOffer.offerId,
      offerVersion: order.activeOffer.version,
      decision: 'accept_split'
    });

    assert.equal(updated.status, 'confirmed');
    assert.equal(updated.lastCustomerDecision, 'accept_split');
    assert.equal(updated.confirmedShipments?.length, 2);
    assert.equal(updated.confirmedShipments?.[0].quantity, 40);
    assert.equal(updated.confirmedShipments?.[0].arrivalDate, '2026-11-27');
    assert.equal(updated.confirmedShipments?.[1].quantity, 10);
    assert.equal(updated.confirmedShipments?.[1].arrivalDate, '2026-11-29');
    assert.equal(updated.activeOffer, undefined);
  });

  test('TC-03: Choice 2 - Accept Later Single Delivery (50 Tue)', async () => {
    const order = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.ok(order.activeOffer);

    const updated = await adapter.replyToOffer(order.orderId, {
      offerId: order.activeOffer.offerId,
      offerVersion: order.activeOffer.version,
      decision: 'accept_later'
    });

    assert.equal(updated.status, 'confirmed');
    assert.equal(updated.lastCustomerDecision, 'accept_later');
    assert.equal(updated.confirmedShipments?.length, 1);
    assert.equal(updated.confirmedShipments?.[0].quantity, 50);
    assert.equal(updated.confirmedShipments?.[0].arrivalDate, '2026-12-01');
  });

  test('TC-04: Choice 3 - Insist on Original Terms (All 50 by Friday)', async () => {
    const order = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.ok(order.activeOffer);

    const updated = await adapter.replyToOffer(order.orderId, {
      offerId: order.activeOffer.offerId,
      offerVersion: order.activeOffer.version,
      decision: 'insist_original'
    });

    assert.equal(updated.status, 'recovery_pending');
    assert.equal(updated.lastCustomerDecision, 'insist_original');
    assert.ok(updated.customerDelayReason?.includes('50 fans together by 2026-11-27'));
    assert.equal(updated.confirmedShipments, undefined); // Stock not falsely marked found
  });

  test('TC-05: Inline Clarification resolution', async () => {
    const clarifyOrder = await adapter.getOrder('ORD-2026-MANIPAL-CLARIFY');
    assert.equal(clarifyOrder.status, 'clarifying');
    assert.ok(clarifyOrder.clarificationPrompt);

    const resolved = await adapter.submitClarification(
      clarifyOrder.orderId,
      clarifyOrder.clarificationPrompt.questionId,
      'arrive_by_friday'
    );

    assert.equal(resolved.status, 'offer_issued');
    assert.equal(resolved.clarificationPrompt, undefined);
    assert.ok(resolved.activeOffer);
    assert.equal(resolved.requestedDetails.quantity, 50); // Preserves quantity
    assert.equal(resolved.requestedDetails.destination, 'Manipal Commercial Center, Shop #14'); // Preserves destination
  });

  test('TC-06: Version Conflict Prevention', async () => {
    const order = await adapter.getOrder('ORD-2026-MANIPAL-50');
    assert.ok(order.activeOffer);

    await assert.rejects(
      async () => {
        await adapter.replyToOffer(order.orderId, {
          offerId: order.activeOffer!.offerId,
          offerVersion: 999, // Stale / incorrect version
          decision: 'accept_split'
        });
      },
      /Offer version conflict/
    );
  });

  test('TC-07: Expired Offer Renewal', async () => {
    const expiredOrder = await adapter.getOrder('ORD-2026-MANIPAL-EXPIRED');
    assert.equal(expiredOrder.status, 'expired');

    const refreshed = await adapter.refreshOffer(expiredOrder.orderId);
    assert.equal(refreshed.status, 'offer_issued');
    assert.ok(refreshed.activeOffer);
    assert.equal(refreshed.activeOffer?.proposedShipments.length, 2);
  });

  test('TC-08: Cross-Order Isolation', async () => {
    // Mutating ORD-2026-MANIPAL-50 must not modify ORD-2026-MANIPAL-LATER
    const order1 = await adapter.getOrder('ORD-2026-MANIPAL-50');
    await adapter.replyToOffer(order1.orderId, {
      offerId: order1.activeOffer!.offerId,
      offerVersion: order1.activeOffer!.version,
      decision: 'accept_split'
    });

    const order2 = await adapter.getOrder('ORD-2026-MANIPAL-LATER');
    assert.equal(order2.status, 'offer_issued');
    assert.equal(order2.activeOffer?.offerType, 'later');
  });

  test('TC-09: Unavoidable Delay Backlog Presentation', async () => {
    const delayOrder = await adapter.getOrder('ORD-2026-MANIPAL-DELAY');
    assert.equal(delayOrder.status, 'unavoidable_delay');
    assert.equal(delayOrder.backlogQuantity, 10);
    assert.equal(delayOrder.confirmedShipments?.length, 1);
    assert.equal(delayOrder.confirmedShipments?.[0].quantity, 40);
  });

  test('TC-10: Non-fan SKU (water pump) to Manipal survives creation, acceptance, and refresh', async () => {
    const created = await adapter.createOrder({
      itemSku: 'PMP-SUB-05-AGR',
      itemName: '0.5 HP Submersible Agricultural Water Pump',
      quantity: 20,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: false
    });

    assert.notEqual(created.orderId, 'ORD-2026-MANIPAL-50');
    assert.match(created.orderId, /^ORD-2026-MANIPAL-/);
    assert.equal(created.status, 'offer_issued');
    assert.equal(created.requestedDetails.itemSku, 'PMP-SUB-05-AGR');
    assert.equal(created.requestedDetails.destination, 'Manipal Commercial Center, Shop #14');
    assert.equal(created.activeOffer?.proposedShipments.length, 2);
    assert.equal(created.activeOffer?.proposedShipments[0].quantity, 15);
    assert.equal(created.activeOffer?.proposedShipments[1].quantity, 5);
    assert.equal(created.activeOffer?.proposedShipments[0].destination, 'Manipal Commercial Center, Shop #14');

    const accepted = await adapter.replyToOffer(created.orderId, {
      offerId: created.activeOffer!.offerId,
      offerVersion: created.activeOffer!.version,
      decision: 'accept_split'
    });

    assert.equal(accepted.status, 'confirmed');
    assert.equal(accepted.confirmedShipments?.length, 2);
    assert.equal(accepted.confirmedShipments?.[0].quantity, 15);
    assert.equal(accepted.confirmedShipments?.[1].quantity, 5);
    assert.equal(accepted.confirmedShipments?.[0].destination, 'Manipal Commercial Center, Shop #14');

    // Simulate refresh via getOrder
    const refreshed = await adapter.getOrder(created.orderId);
    assert.equal(refreshed.status, 'confirmed');
    assert.equal(refreshed.requestedDetails.itemSku, 'PMP-SUB-05-AGR');
    assert.equal(refreshed.requestedDetails.destination, 'Manipal Commercial Center, Shop #14');
    assert.equal(refreshed.confirmedShipments?.[0].quantity, 15);
    assert.equal(refreshed.confirmedShipments?.[1].quantity, 5);
  });

  test('TC-11: Fan SKU to Kundapura survives creation, acceptance, and refresh', async () => {
    const created = await adapter.createOrder({
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Kundapura Market Road, Shop #7',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: false
    });

    assert.notEqual(created.orderId, 'ORD-2026-MANIPAL-50');
    assert.match(created.orderId, /^ORD-2026-KUNDAPURA-/);
    assert.equal(created.requestedDetails.itemSku, 'FAN-HV-24-IND');
    assert.equal(created.requestedDetails.destination, 'Kundapura Market Road, Shop #7');
    assert.equal(created.activeOffer?.proposedShipments[0].quantity, 40);
    assert.equal(created.activeOffer?.proposedShipments[1].quantity, 10);
    assert.equal(created.activeOffer?.proposedShipments[0].destination, 'Kundapura Market Road, Shop #7');

    const accepted = await adapter.replyToOffer(created.orderId, {
      offerId: created.activeOffer!.offerId,
      offerVersion: created.activeOffer!.version,
      decision: 'accept_split'
    });

    assert.equal(accepted.status, 'confirmed');
    assert.equal(accepted.confirmedShipments?.[0].destination, 'Kundapura Market Road, Shop #7');
    assert.equal(accepted.confirmedShipments?.[1].destination, 'Kundapura Market Road, Shop #7');

    // Simulate refresh via getOrder
    const refreshed = await adapter.getOrder(created.orderId);
    assert.equal(refreshed.status, 'confirmed');
    assert.equal(refreshed.requestedDetails.itemSku, 'FAN-HV-24-IND');
    assert.equal(refreshed.requestedDetails.destination, 'Kundapura Market Road, Shop #7');
    assert.equal(refreshed.confirmedShipments?.[0].quantity, 40);
    assert.equal(refreshed.confirmedShipments?.[1].quantity, 10);
  });

  test('TC-12: Unknown SKU is rejected without manufacturing stock', async () => {
    await assert.rejects(
      async () => {
        await adapter.createOrder({
          itemSku: 'UNKNOWN-SKU-999',
          itemName: 'Nonexistent Item',
          quantity: 10,
          destination: 'Manipal',
          requestedArrivalDate: '2026-11-27',
          mustArriveTogether: false
        });
      },
      /not recognized/
    );
  });

  test('TC-13: Seeded pump scenario integrity', async () => {
    const pumpOrder = await adapter.getOrder('ORD-2026-BRAHMAVAR-20-PUMP');
    assert.equal(pumpOrder.requestedDetails.itemSku, 'PMP-SUB-05-AGR');
    assert.equal(pumpOrder.requestedDetails.quantity, 20);
    assert.equal(pumpOrder.activeOffer?.proposedShipments[0].quantity, 15);
    assert.equal(pumpOrder.activeOffer?.proposedShipments[1].quantity, 5);
  });
});
