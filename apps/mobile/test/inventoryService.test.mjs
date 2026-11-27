import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  fetchStockBalances,
  fetchEventHistory,
  fetchFeedHealth,
  mergeLocalAndRemoteEvents,
  mapFeedStatusToSummary,
} = require('../.tmp-test/services/inventoryService.js');

test('fetches and maps GET /stock with numeric IDs and stock quantities', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8000';
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          count: 1,
          items: [
            {
              plant_id: 1,
              plant_name: 'Mangaluru',
              sku_id: 10,
              sku_code: 'SKU-MTR-402',
              sku_name: 'BLDC Motor',
              unit: 'EA',
              physical_stock: 1500,
              reserved_stock: 200,
              confirmed_arrivals: 240,
              available_stock: 1540,
              last_event_id: 77,
              updated_at: '2026-11-27T10:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const res = await fetchStockBalances([], []);
    assert.equal(res.ok, true);
    assert.equal(res.count, 1);
    assert.equal(res.plants[0].backendId, 1);
    assert.equal(res.plants[0].name, 'Mangaluru');
    assert.equal(res.skus[0].backendId, 10);
    assert.equal(res.skus[0].id, 'SKU-MTR-402');
    assert.equal(res.skus[0].onHand, 1500);
    assert.equal(res.skus[0].reserved, 200);
    assert.equal(res.skus[0].confirmedArrivals, 240);
    assert.equal(res.skus[0].availableStock, 1540);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('handles empty stock response and backend unavailability cleanly', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8000';
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ count: 0, items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const emptyRes = await fetchStockBalances([], []);
    assert.equal(emptyRes.ok, true);
    assert.equal(emptyRes.count, 0);
    assert.equal(emptyRes.skus.length, 0);

    globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const errRes = await fetchStockBalances([], []);
    assert.equal(errRes.ok, false);
    assert.match(errRes.error, /Network unreachable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('merges backend-confirmed events with local pending/failed queue without duplicates', () => {
  const local = [
    {
      eventId: 'EVT-LOCAL-PENDING',
      status: 'pending',
      serverConfirmed: false,
      createdAtIso: '2026-11-27T10:05:00Z',
    },
    {
      eventId: 'EVT-SYNCED-1',
      status: 'pending',
      serverConfirmed: false,
      createdAtIso: '2026-11-27T10:00:00Z',
    },
  ];
  const remote = [
    {
      eventId: 'EVT-SYNCED-1',
      status: 'submitted',
      serverConfirmed: true,
      serverId: 55,
      createdAtIso: '2026-11-27T10:00:00Z',
    },
    {
      eventId: 'EVT-REMOTE-2',
      status: 'submitted',
      serverConfirmed: true,
      serverId: 54,
      createdAtIso: '2026-11-27T09:50:00Z',
    },
  ];

  const merged = mergeLocalAndRemoteEvents(local, remote);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].eventId, 'EVT-LOCAL-PENDING');
  assert.equal(merged[0].serverConfirmed, false);
  assert.equal(merged[1].eventId, 'EVT-SYNCED-1');
  assert.equal(merged[1].serverConfirmed, true);
  assert.equal(merged[1].status, 'submitted');
  assert.equal(merged[2].eventId, 'EVT-REMOTE-2');
});

test('passes pagination parameters to GET /events and maps feed health statuses', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8000';
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';

  try {
    globalThis.fetch = async (url) => {
      requestedUrl = String(url);
      return new Response(
        JSON.stringify({ total: 10, limit: 2, offset: 2, items: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const pageRes = await fetchEventHistory({ limit: 2, offset: 2 }, [], []);
    assert.equal(pageRes.ok, true);
    assert.match(requestedUrl, /\/events\?limit=2&offset=2/);
    assert.equal(pageRes.total, 10);

    for (const status of ['HEALTHY', 'STALE', 'DEGRADED', 'UNKNOWN']) {
      const summary = mapFeedStatusToSummary([
        {
          source: 'mobile-manager',
          status,
          is_stale: status === 'STALE',
          stale_threshold_seconds: 60,
          seconds_since_last_signal: null,
          last_heartbeat_at: null,
          last_event_at: null,
          last_error_at: null,
          last_error_message: status === 'DEGRADED' ? 'Timeout' : null,
          recent_failure_count: status === 'DEGRADED' ? 2 : 0,
          total_events_ingested: 5,
          data_warning: status === 'STALE' ? 'Feed stale' : null,
        },
      ]);
      assert.equal(summary.status, status);
      assert.equal(summary.lastHeartbeatIst, null);
    }

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          checked_at: '2026-11-27T10:00:00Z',
          feeds: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    const feedRes = await fetchFeedHealth();
    assert.equal(feedRes.ok, true);
    assert.equal(feedRes.summary, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
