import { EventOperation, InventoryEvent } from '../types/inventory';
import { apiRequest } from './apiClient';

export const MOBILE_EVENT_SOURCE = 'mobile-manager';

export type BackendEventType =
  | 'STOCK_RECEIVED'
  | 'STOCK_DISPATCHED'
  | 'PHYSICAL_COUNT';

export interface BackendInventoryEventCreate {
  source: string;
  external_event_id: string;
  plant_id: number;
  sku_id: number;
  event_type: BackendEventType;
  quantity: number;
  source_sequence: number;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

export interface BackendEventIngestionResponse {
  status: 'accepted' | 'duplicate' | string;
  idempotent: boolean;
  message: string;
  event: {
    id: number;
    source: string;
    external_event_id: string;
    plant_id: number;
    sku_id: number;
    event_type: string;
    quantity: number;
    source_sequence: number;
    occurred_at: string;
    received_at: string;
    metadata: Record<string, unknown>;
  };
}

// Tracks in-flight event IDs to prevent duplicate concurrent POST /events submissions
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
  return `${full.slice(0, 5)} IST`;
}

export function generateStableEventId(existingCount: number): string {
  const year = new Date().getFullYear();
  const num = 9045 + existingCount;
  const suffix = Math.floor(100 + Math.random() * 900);
  return `EVT-${year}-${num}-${suffix}`;
}

export function mapOperationToBackendEventType(
  operation: EventOperation
): BackendEventType {
  switch (operation) {
    case 'goods_received':
      return 'STOCK_RECEIVED';
    case 'goods_dispatch':
      return 'STOCK_DISPATCHED';
    case 'stock_correction':
      return 'PHYSICAL_COUNT';
  }
}

/**
 * Builds the exact InventoryEventCreate payload expected by FastAPI POST /events.
 */
export function buildBackendEventPayload(
  event: InventoryEvent
): BackendInventoryEventCreate {
  const eventType = mapOperationToBackendEventType(event.operation);

  let quantity: number;
  if (event.operation === 'stock_correction') {
    quantity =
      typeof event.newQty === 'number'
        ? Math.max(0, event.newQty)
        : Math.max(0, (event.previousQty ?? 0) + event.qtyDelta);
  } else {
    // Both STOCK_RECEIVED and STOCK_DISPATCHED require strictly positive quantity (> 0)
    quantity = Math.abs(event.qtyDelta);
  }

  return {
    source: MOBILE_EVENT_SOURCE,
    external_event_id: event.eventId,
    plant_id: event.backendPlantId,
    sku_id: event.backendSkuId,
    event_type: eventType,
    quantity,
    source_sequence: event.sourceSequence,
    occurred_at: event.createdAtIso,
    metadata: {
      plant_code: event.plantId,
      sku_code: event.skuId,
      bin: event.bin,
      reference: event.referenceValue,
      destination_or_bin: event.destinationOrBin,
      condition_or_handler: event.conditionOrHandler,
      audit_note: event.auditNote,
    },
  };
}

export interface SyncOutcome {
  event: InventoryEvent;
  synced: boolean;
}

/**
 * Submits or retries an inventory event via POST /events using its stable external_event_id
 * and source_sequence. Prevents duplicate concurrent submissions and blind retries of quarantined events.
 */
export async function syncInventoryEvent(
  event: InventoryEvent,
  isOfflineMode: boolean,
  authToken?: string
): Promise<SyncOutcome> {
  if (event.status === 'submitted') {
    return { event, synced: true };
  }

  // Quarantined events (HTTP 422) require payload editing before resubmission
  if (event.quarantined) {
    return { event, synced: false };
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
          detail: `Retained locally (${event.eventId}, seq ${event.sourceSequence})`,
          tone: 'warning',
        },
      ],
    };
    return { event: updated, synced: false };
  }

  inFlightEventIds.add(event.eventId);

  try {
    const payload = buildBackendEventPayload(event);
    const result = await apiRequest<BackendEventIngestionResponse>('/events', {
      method: 'POST',
      body: payload,
      token: authToken,
    });

    if (result.ok) {
      const isDuplicate =
        result.status === 200 ||
        result.data.idempotent ||
        result.data.status === 'duplicate';

      const updated: InventoryEvent = {
        ...event,
        status: 'submitted',
        quarantined: false,
        quarantinedEventId: undefined,
        errorDiagnostics: undefined,
        attempts: [
          ...event.attempts,
          {
            timeIst: nowTime,
            label: isDuplicate
              ? 'Duplicate Accepted (Idempotent)'
              : 'Synced to Backend',
            detail: `HTTP ${result.status} · ${result.data.message}`,
            tone: 'success',
          },
        ],
      };
      return { event: updated, synced: true };
    }

    if (result.error.kind === 'not_configured') {
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

    if (result.error.kind === 'quarantined') {
      const qId = result.error.quarantinedEventId;
      const reason = result.error.reason ?? result.error.message;
      const updated: InventoryEvent = {
        ...event,
        status: 'failed',
        quarantined: true,
        quarantinedEventId: qId,
        errorDiagnostics: {
          code: qId ? `HTTP 422 · Quarantine #${qId}` : 'HTTP 422 · Quarantined',
          message: `${reason} Edit the payload before resubmitting.`,
        },
        attempts: [
          ...event.attempts,
          {
            timeIst: nowTime,
            label: 'Quarantined by Backend (HTTP 422)',
            detail: qId ? `#${qId} · ${reason}` : reason,
            tone: 'error',
          },
        ],
      };
      return { event: updated, synced: false };
    }

    const codeLabel = result.error.status
      ? `HTTP ${result.error.status}`
      : 'NETWORK_ERR';
    const updated: InventoryEvent = {
      ...event,
      status: 'failed',
      quarantined: false,
      errorDiagnostics: {
        code: codeLabel,
        message: `${result.error.message} Retrying reuses ${event.eventId} (seq ${event.sourceSequence}) idempotently.`,
      },
      attempts: [
        ...event.attempts,
        {
          timeIst: nowTime,
          label: 'Sync Attempt Failed',
          detail: `${codeLabel} · ${result.error.message}`,
          tone: 'error',
        },
      ],
    };
    return { event: updated, synced: false };
  } finally {
    inFlightEventIds.delete(event.eventId);
  }
}
