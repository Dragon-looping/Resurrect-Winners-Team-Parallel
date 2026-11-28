import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LiveApiOrderAdapter } from '../src/customer/adapters/orderAdapter.ts';

describe('Live API Customer Journey End-to-End Suite', () => {
  const adapter = new LiveApiOrderAdapter('http://127.0.0.1:8000');

  test('Order 1: Fan order to Manipal — creation, insist on original, read-only transfer status check, and reload', async () => {
    // 1. Submit LIVE Fan Order to Manipal
    const request = {
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-12-15',
      mustArriveTogether: false,
      notes: 'Live verification order 1 - Status check only'
    };

    const order = await adapter.createOrder(request);
    console.log(`[ORDER 1] Created order ID: ${order.orderId}, Status: ${order.status}`);
    assert.ok(order.orderId, 'Order must have a valid orderId');
    assert.equal(order.status, 'offer_issued', 'Status must be offer_issued upon creation with active offer');
    assert.equal(order.requestedDetails.quantity, 50);
    assert.equal(order.requestedDetails.itemSku, 'FAN-EL-001', 'Must save canonical fan SKU FAN-EL-001');
    assert.ok(order.requestedDetails.destination.includes('Manipal'), 'Destination must preserve Manipal');
    assert.ok(order.activeOffer, 'Order must have an active offer');
    assert.equal(order.activeOffer.proposedShipments.length, 2, 'Must propose a split offer for 50 units (38 + 12)');
    assert.equal(order.activeOffer.proposedShipments[0].quantity, 38, 'Primary shipment must be 38');
    assert.equal(order.activeOffer.proposedShipments[1].quantity, 12, 'Secondary shipment must be 12');

    // 2. Insist on original terms (all 50 together by original date)
    const afterInsist = await adapter.replyToOffer(order.orderId, {
      offerId: order.activeOffer.offerId,
      offerVersion: order.activeOffer.version,
      decision: 'insist_original',
      insistenceReason: 'Customer requires all 50 units on Dec 15'
    });

    console.log(`[ORDER 1] Status after insist: ${afterInsist.status}`);
    assert.equal(afterInsist.status, 'recovery_pending', 'Status must transition to recovery_pending');
    assert.equal(afterInsist.activeOffer, undefined, 'Old rejected offer must be cleared');
    assert.ok(afterInsist.availableOffers?.split, 'Backend split offer must be available for recovery screen');
    assert.ok(afterInsist.availableOffers?.later, 'Backend later offer must be available for recovery screen');

    // 3. Read-only status check (Check Inter-Hub Transfer Status Now)
    const afterCheck = await adapter.getOrder(order.orderId);
    console.log(`[ORDER 1] Status after transfer check: ${afterCheck.status}`);
    assert.equal(afterCheck.status, 'recovery_pending', 'Read-only check must leave recovery_pending intact');
    assert.equal(afterCheck.confirmedShipments, undefined, 'Must not create premature confirmed shipments');

    // 4. Reload direct link: verify recovery_pending persists in PostgreSQL
    const reloaded = await adapter.getOrder(order.orderId);
    console.log(`[ORDER 1] Status after direct link reload: ${reloaded.status}`);
    assert.equal(reloaded.status, 'recovery_pending', 'Recovery pending status must persist on direct link reload');
    assert.equal(reloaded.requestedDetails.quantity, 50);
    assert.ok(reloaded.requestedDetails.destination.includes('Manipal'));
  });

  test('Order 2: Separate Live Order for Split schedule acceptance and direct link reload', async () => {
    // 1. Submit independent LIVE Order 2
    const request = {
      itemSku: 'FAN-EL-001',
      itemName: 'Electric fans',
      quantity: 50,
      destination: 'Manipal Retail Hub, Syndicate Circle',
      requestedArrivalDate: '2026-12-18',
      mustArriveTogether: false,
      notes: 'Live verification order 2 - Split acceptance'
    };

    const order = await adapter.createOrder(request);
    console.log(`[ORDER 2] Created order ID: ${order.orderId}, Status: ${order.status}`);
    assert.ok(order.orderId);

    // 2. Insist on original terms to enter recovery_pending
    const afterInsist = await adapter.replyToOffer(order.orderId, {
      offerId: order.activeOffer!.offerId,
      offerVersion: order.activeOffer!.version,
      decision: 'insist_original'
    });
    assert.equal(afterInsist.status, 'recovery_pending');

    // 3. Accept split schedule from recovery_pending screen using backend-issued offer
    const afterSplit = await adapter.replyToOffer(order.orderId, {
      offerId: 'OFF-BACKEND-SPLIT',
      offerVersion: 1,
      decision: 'accept_split'
    });

    console.log(`[ORDER 2] Status after accepting split: ${afterSplit.status}`);
    assert.equal(afterSplit.status, 'confirmed', 'Status must transition to confirmed');
    assert.ok(afterSplit.confirmedShipments, 'Must have confirmedShipments');
    assert.equal(afterSplit.confirmedShipments.length, 2, 'Must have 2 confirmed shipments');
    assert.equal(afterSplit.confirmedShipments[0].quantity, 38, 'Confirmed shipment 1 must be 38');
    assert.equal(afterSplit.confirmedShipments[1].quantity, 12, 'Confirmed shipment 2 must be 12');

    // 4. Refresh / direct link reload: verify confirmed state in PostgreSQL
    const reloaded = await adapter.getOrder(order.orderId);
    console.log(`[ORDER 2] Status after direct link reload: ${reloaded.status}`);
    assert.equal(reloaded.status, 'confirmed', 'Confirmed status must persist on direct link reload');
    assert.equal(reloaded.confirmedShipments?.length, 2, '2 confirmed shipments must persist on reload');
    assert.equal(reloaded.confirmedShipments[0].quantity, 38);
    assert.equal(reloaded.confirmedShipments[1].quantity, 12);
  });

  test('Order 3: Separate Live Order for Later single load acceptance and direct link reload', async () => {
    // 1. Submit independent LIVE Order 3 to Kundapura destination
    const request = {
      itemSku: 'FAN-EL-001',
      itemName: 'Electric fans',
      quantity: 50,
      destination: 'Kundapura Electricals Depot, Main Market Road',
      requestedArrivalDate: '2026-12-20',
      mustArriveTogether: false,
      notes: 'Live verification order 3 - Later acceptance'
    };

    const order = await adapter.createOrder(request);
    console.log(`[ORDER 3] Created order ID: ${order.orderId}, Status: ${order.status}`);
    assert.ok(order.orderId);
    assert.equal(order.requestedDetails.itemSku, 'FAN-EL-001');
    assert.ok(order.requestedDetails.destination.includes('Kundapura'), 'Destination must preserve Kundapura');

    // 2. Insist on original terms
    const afterInsist = await adapter.replyToOffer(order.orderId, {
      offerId: order.activeOffer!.offerId,
      offerVersion: order.activeOffer!.version,
      decision: 'insist_original'
    });
    assert.equal(afterInsist.status, 'recovery_pending');

    // 3. Accept later single load from recovery_pending screen using backend-issued offer
    const afterLater = await adapter.replyToOffer(order.orderId, {
      offerId: 'OFF-BACKEND-LATER',
      offerVersion: 1,
      decision: 'accept_later'
    });

    console.log(`[ORDER 3] Status after accepting later load: ${afterLater.status}`);
    assert.equal(afterLater.status, 'confirmed');
    assert.ok(afterLater.confirmedShipments);
    assert.equal(afterLater.confirmedShipments.length, 1, 'Must have 1 single consolidated shipment');
    assert.equal(afterLater.confirmedShipments[0].quantity, 50, 'Single shipment must contain all 50 units');

    // 4. Refresh / direct link reload: verify confirmed state in PostgreSQL
    const reloaded = await adapter.getOrder(order.orderId);
    console.log(`[ORDER 3] Status after direct link reload: ${reloaded.status}`);
    assert.equal(reloaded.status, 'confirmed');
    assert.equal(reloaded.confirmedShipments?.length, 1);
    assert.equal(reloaded.confirmedShipments[0].quantity, 50);
    assert.ok(reloaded.requestedDetails.destination.includes('Kundapura'));
  });

  test('Order 4: Pump SKU to Kundapura and unsupported SKU handling', async () => {
    // Submitting a pump SKU in Live API mode must throw a clear error explaining unsupported SKU
    // and must NEVER silently substitute Motors (MTR-IND-001) or other items.
    const pumpRequest = {
      itemSku: 'PMP-SUB-05-AGR',
      itemName: '0.5 HP Submersible Agricultural Water Pump',
      quantity: 20,
      destination: 'Kundapura Agro Depot, Main Road',
      requestedArrivalDate: '2026-12-22',
      mustArriveTogether: false
    };

    await assert.rejects(
      async () => {
        await adapter.createOrder(pumpRequest);
      },
      (err: Error) => {
        assert.ok(err.message.includes('Live API does not support pump SKU'), 'Error must clearly state pump SKU is unsupported');
        assert.ok(err.message.includes('PMP-SUB-05-AGR'), 'Error must name the requested SKU');
        assert.ok(err.message.includes('pending P2 backend ingestion'), 'Error must flag backend dependency for P2');
        return true;
      }
    );

    // Unsupported out-of-corridor destination must also throw clear error
    const outOfBoundsRequest = {
      itemSku: 'FAN-EL-001',
      itemName: 'Electric fans',
      quantity: 10,
      destination: 'Delhi Express Logistics Hub, Connaught Place',
      requestedArrivalDate: '2026-12-25',
      mustArriveTogether: false
    };

    await assert.rejects(
      async () => {
        await adapter.createOrder(outOfBoundsRequest);
      },
      (err: Error) => {
        assert.ok(err.message.includes('outside the SETUVYUHA regional logistics network'), 'Must explain regional boundary');
        return true;
      }
    );
  });

  test('Test 5: Failed status check / network error handling', async () => {
    // Calling an adapter with an unreachable or non-existent endpoint must throw a catchable error
    const brokenAdapter = new LiveApiOrderAdapter('http://127.0.0.1:9999');
    await assert.rejects(
      async () => {
        await brokenAdapter.getOrder('99999');
      },
      (err: Error) => {
        assert.ok(err.message, 'Must throw a descriptive error when status check fails');
        return true;
      }
    );
  });
});
