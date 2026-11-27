import { InventoryEvent } from '../types/inventory';
import { getApiBaseUrl } from './config';

// Tracks in-flight event IDs to prevent duplicate POST /events submissions
const inFlightEventIds = new Set<string>();

export function formatIstTime(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `${formatter.format(date)} IST`;
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} IST`;
  }
}

export function formatShortIstTime(date: Date = new Date()): string {
  const full = formatIstTime(date);
  // HH:MM IST
  return `${full.slice(0, 5)} IST`;
}

export function generateStableEventId(existingCount: number): string {
  const year = new Date().getFullYear();
  const num = 9045 + existingCount;
  const suffix = Math.floor(100 + Math.random() * 900);
  return `EVT-${year}-${num}-${suffix}`;
}

export interface SyncOutcome {
  event: InventoryEvent;
  synced: boolean;
}

/**
 * Submits or retries an inventory event via POST /events using its stable eventId.
 * Prevents duplicate concurrent submissions for the same eventId.
 */
export async function syncInventoryEvent(
  event: InventoryEvent,
  isOfflineMode: boolean,
  authToken?: string
): Promise<SyncOutcome> {
  if (event.status === 'submitted') {
    return { event, synced: true };
  }

  if (inFlightEventIds.has(event.eventId)) {
    return { event, synced: false };
  }

  const nowTime = formatIstTime();

  if (isOfflineMode) {
    const updated: InventoryEvent = {
      ...event,
      status: 'pending',
      attempts: [
        ...event.attempts,
        {
          timeIst: nowTime,
          label: 'Queued Offline',
          detail: 'Device offline — retained in local queue for idempotent sync',
          tone: 'warning',
        },
      ],
    };
    return { event: updated, synced: false };
  }

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    const updated: InventoryEvent = {
      ...event,
      status: 'pending',
      attempts: [
        ...event.attempts,
        {
          timeIst: nowTime,
          label: 'Sync Deferred (No API URL)',
          detail: 'EXPO_PUBLIC_API_BASE_URL not configured — queued locally',
          tone: 'warning',
        },
      ],
    };
    return { event: updated, synced: false };
  }

  inFlightEventIds.add(event.eventId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event_id: event.eventId,
        operation: event.operation,
        plant_id: event.plantId,
        sku_id: event.skuId,
        qty_delta: event.qtyDelta,
        previous_qty: event.previousQty,
        new_qty: event.newQty,
        reference: event.referenceValue,
        destination_or_bin: event.destinationOrBin,
        condition_or_handler: event.conditionOrHandler,
        audit_note: event.auditNote,
        created_at: event.createdAtIso,
      }),
      signal: controller.signal,
    });

    if (response.ok) {
      const updated: InventoryEvent = {
        ...event,
        status: 'submitted',
        errorDiagnostics: undefined,
        attempts: [
          ...event.attempts,
          {
            timeIst: nowTime,
            label: 'Synced to Backend',
            detail: `HTTP ${response.status} · Event ${event.eventId} acknowledged`,
            tone: 'success',
          },
        ],
      };
      return { event: updated, synced: true };
    }

    const codeLabel = `HTTP ${response.status}`;
    const updated: InventoryEvent = {
      ...event,
      status: 'failed',
      errorDiagnostics: {
        code: codeLabel,
        message: `Backend rejected or timed out (${codeLabel}). Retrying reuses original event ID ${event.eventId} (idempotent, no duplicate stock deduction).`,
      },
      attempts: [
        ...event.attempts,
        {
          timeIst: nowTime,
          label: 'Sync Attempt Failed',
          detail: `${codeLabel} · Server error`,
          tone: 'error',
        },
      ],
    };
    return { event: updated, synced: false };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const updated: InventoryEvent = {
      ...event,
      status: 'failed',
      errorDiagnostics: {
        code: isTimeout ? 'HTTP 504' : 'NETWORK_ERR',
        message: isTimeout
          ? `Gateway timed out. Retrying reuses original event ID ${event.eventId} (idempotent, no duplicate stock deduction).`
          : `Network unreachable. Retrying reuses original event ID ${event.eventId} (idempotent).`,
      },
      attempts: [
        ...event.attempts,
        {
          timeIst: nowTime,
          label: 'Sync Attempt Failed',
          detail: isTimeout ? 'HTTP 504 Gateway Timeout' : 'Network unreachable',
          tone: 'error',
        },
      ],
    };
    return { event: updated, synced: false };
  } finally {
    clearTimeout(timeout);
    inFlightEventIds.delete(event.eventId);
  }
}
