import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildBackendEventPayload,
  syncInventoryEvent,
} = require('../.tmp-test/services/eventService.js');

function makeEvent(overrides = {}) {
  return {
    eventId: 'EVT-2026-9050-111',
    operation: 'goods_received',
    operationLabel: 'Goods Received',
    plantId: 'PLT-MGL',
    backendPlantId: 1,
    plantName: 'Mangaluru',
    bin: 'BIN M-04',
    skuId: 'SKU-MTR-402',
    backendSkuId: 1,
    skuName: 'BLDC Motor',
    qtyDelta: 240,
    sourceSequence: 101,
    referenceLabel: 'Delivery Note / PO',
    referenceValue: 'PO-2026-88412',
    status: 'pending',
    createdAtIso: '2026-11-27T09:30:00.000Z',
    timestampIst: '15:00 IST',
    attempts: [],
    ...overrides,
  };
}

test('maps goods_received, goods_dispatch (positive quantity), and stock_correction (including 0)', () => {
  const receipt = buildBackendEventPayload(
    makeEvent({ operation: 'goods_received', qtyDelta: 240 })
  );
  assert.equal(receipt.event_type, 'STOCK_RECEIVED');
  assert.equal(receipt.quantity, 240);
  assert.equal(receipt.plant_id, 1);
  assert.equal(receipt.sku_id, 1);
  assert.equal(receipt.external_event_id, 'EVT-2026-9050-111');
  assert.equal(receipt.source_sequence, 101);

  const dispatch = buildBackendEventPayload(
    makeEvent({ operation: 'goods_dispatch', qtyDelta: -180 })
  );
  assert.equal(dispatch.event_type, 'STOCK_DISPATCHED');
  assert.equal(dispatch.quantity, 180);

  const correctionZero = buildBackendEventPayload(
    makeEvent({
      operation: 'stock_correction',
      previousQty: 50,
      newQty: 0,
      qtyDelta: -50,
    })
  );
  assert.equal(correctionZero.event_type, 'PHYSICAL_COUNT');
  assert.equal(correctionZero.quantity, 0);
});

test('handles HTTP 201 accepted and HTTP 200 duplicate idempotently', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8000';
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 'accepted',
          idempotent: false,
          message: 'Inventory event persisted successfully.',
          event: { id: 1 },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );

    const res201 = await syncInventoryEvent(makeEvent(), false);
    assert.equal(res201.synced, true);
    assert.equal(res201.event.status, 'submitted');

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 'duplicate',
          idempotent: true,
          message: 'Duplicate event ignored idempotently.',
          event: { id: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const res200 = await syncInventoryEvent(
      makeEvent({ eventId: 'EVT-2026-9050-222', sourceSequence: 102 }),
      false
    );
    assert.equal(res200.synced, true);
    assert.equal(res200.event.status, 'submitted');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('handles HTTP 422 quarantine and blocks blind retry', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8000';
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  try {
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          detail: {
            error: 'Event quarantined due to domain validation failure',
            reason: 'Insufficient stock for dispatch',
            quarantined_event_id: 42,
          },
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const first = await syncInventoryEvent(
      makeEvent({
        eventId: 'EVT-2026-9050-333',
        operation: 'goods_dispatch',
        qtyDelta: -9999,
      }),
      false
    );
    assert.equal(first.synced, false);
    assert.equal(first.event.status, 'failed');
    assert.equal(first.event.quarantined, true);
    assert.equal(first.event.quarantinedEventId, 42);
    assert.match(first.event.errorDiagnostics?.message ?? '', /Insufficient stock/);
    assert.equal(fetchCalls, 1);

    // Blind retry must NOT hit the network
    const second = await syncInventoryEvent(first.event, false);
    assert.equal(second.synced, false);
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retains event on network failure and reuses same external_event_id and source_sequence on retry', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8000';
  const originalFetch = globalThis.fetch;
  const sentPayloads = [];

  try {
    globalThis.fetch = async (_url, init) => {
      sentPayloads.push(JSON.parse(String(init?.body)));
      throw new Error('ECONNREFUSED');
    };

    const failed = await syncInventoryEvent(
      makeEvent({ eventId: 'EVT-2026-9050-444', sourceSequence: 109 }),
      false
    );
    assert.equal(failed.synced, false);
    assert.equal(failed.event.status, 'failed');
    assert.equal(failed.event.quarantined, false);

    globalThis.fetch = async (_url, init) => {
      sentPayloads.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          status: 'accepted',
          idempotent: false,
          message: 'Inventory event persisted successfully.',
          event: { id: 9 },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const retried = await syncInventoryEvent(failed.event, false);
    assert.equal(retried.synced, true);
    assert.equal(retried.event.status, 'submitted');
    assert.equal(sentPayloads.length, 2);
    assert.equal(sentPayloads[0].external_event_id, 'EVT-2026-9050-444');
    assert.equal(sentPayloads[1].external_event_id, 'EVT-2026-9050-444');
    assert.equal(sentPayloads[0].source_sequence, 109);
    assert.equal(sentPayloads[1].source_sequence, 109);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
