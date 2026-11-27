import {
  BackendFeedStatus,
  EventOperation,
  FeedHealthSummary,
  InventoryEvent,
  Plant,
  SkuItem,
} from '../types/inventory';
import { apiRequest } from './apiClient';
import { formatShortIstTime } from './eventService';

export interface BackendStockItem {
  plant_id: number;
  plant_name: string;
  sku_id: number;
  sku_code: string;
  sku_name: string;
  unit: string;
  physical_stock: number;
  reserved_stock: number;
  confirmed_arrivals: number;
  available_stock: number;
  last_event_id: number | null;
  updated_at: string | null;
}

export interface BackendStockListResponse {
  count: number;
  items: BackendStockItem[];
}

export interface BackendInventoryEventItem {
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
}

export interface BackendPaginatedEventsResponse {
  total: number;
  limit: number;
  offset: number;
  items: BackendInventoryEventItem[];
}

export interface BackendFeedStatusItem {
  source: string;
  status: BackendFeedStatus;
  is_stale: boolean;
  stale_threshold_seconds: number;
  seconds_since_last_signal: number | null;
  last_heartbeat_at: string | null;
  last_event_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  recent_failure_count: number;
  total_events_ingested: number;
  data_warning: string | null;
}

export interface BackendFeedStatusListResponse {
  checked_at: string;
  feeds: BackendFeedStatusItem[];
}

export function mapStockItemsToDomain(
  items: BackendStockItem[],
  knownPlants: Plant[] = [],
  knownSkus: SkuItem[] = []
): { plants: Plant[]; skus: SkuItem[] } {
  const plantMap = new Map<number, Plant>();
  const skus: SkuItem[] = [];

  for (const item of items) {
    const existingPlant = knownPlants.find(
      (p) => p.backendId === item.plant_id || p.name.toLowerCase() === item.plant_name.toLowerCase()
    );
    const plantCode = existingPlant?.id ?? `PLT-${String(item.plant_id).padStart(2, '0')}`;

    if (!plantMap.has(item.plant_id)) {
      plantMap.set(item.plant_id, {
        id: plantCode,
        backendId: item.plant_id,
        name: item.plant_name,
        godownLabel: existingPlant?.godownLabel ?? `Plant #${item.plant_id}`,
        sublabel: existingPlant?.sublabel ?? `Plant #${item.plant_id} · Live Stock`,
      });
    }

    const existingSku = knownSkus.find(
      (s) => s.backendId === item.sku_id && s.backendPlantId === item.plant_id
    );
    const isMotor =
      item.sku_code.toUpperCase().includes('MTR') ||
      item.sku_name.toLowerCase().includes('motor') ||
      item.sku_name.toLowerCase().includes('rotor');
    const category = existingSku?.category ?? (isMotor ? 'motor' : 'fan');
    const categoryShort = existingSku?.categoryShort ?? (category === 'motor' ? 'Raw' : 'Fin');
    const bin = existingSku?.bin ?? `BIN-${item.sku_id}`;

    skus.push({
      id: item.sku_code,
      backendId: item.sku_id,
      plantId: plantCode,
      backendPlantId: item.plant_id,
      name: item.sku_name,
      shortDesc: `${item.sku_name} · ${categoryShort} · ${bin.replace('BIN ', '')}`,
      category,
      categoryShort,
      unit: item.unit,
      bin,
      onHand: item.physical_stock,
      reserved: item.reserved_stock,
      confirmedArrivals: item.confirmed_arrivals,
      availableStock: item.available_stock,
      minThreshold: existingSku?.minThreshold,
    });
  }

  return {
    plants: Array.from(plantMap.values()),
    skus,
  };
}

function mapBackendEventTypeToOperation(eventType: string): {
  operation: EventOperation;
  operationLabel: string;
  referenceLabel: string;
} {
  switch (eventType) {
    case 'STOCK_RECEIVED':
      return {
        operation: 'goods_received',
        operationLabel: 'Goods Received',
        referenceLabel: 'Delivery Note / PO',
      };
    case 'STOCK_DISPATCHED':
      return {
        operation: 'goods_dispatch',
        operationLabel: 'Goods Dispatch',
        referenceLabel: 'Work Order',
      };
    default:
      return {
        operation: 'stock_correction',
        operationLabel: 'Stock Correction',
        referenceLabel: 'Reason Code',
      };
  }
}

export function mapBackendEventToDomain(
  item: BackendInventoryEventItem,
  plants: Plant[] = [],
  skus: SkuItem[] = []
): InventoryEvent {
  const { operation, operationLabel, referenceLabel } =
    mapBackendEventTypeToOperation(item.event_type);

  const plant = plants.find((p) => p.backendId === item.plant_id);
  const sku = skus.find(
    (s) => s.backendId === item.sku_id && s.backendPlantId === item.plant_id
  );
  const meta = item.metadata ?? {};

  const occurredDate = new Date(item.occurred_at);
  const timestampIst = Number.isNaN(occurredDate.getTime())
    ? item.occurred_at
    : formatShortIstTime(occurredDate);

  const qtyDelta =
    item.event_type === 'STOCK_DISPATCHED'
      ? -Math.abs(item.quantity)
      : item.quantity;

  return {
    eventId: item.external_event_id,
    operation,
    operationLabel,
    plantId: String(meta.plant_code ?? plant?.id ?? `PLT-${item.plant_id}`),
    backendPlantId: item.plant_id,
    plantName: plant?.name ?? `Plant #${item.plant_id}`,
    bin: String(meta.bin ?? sku?.bin ?? `BIN-${item.sku_id}`),
    skuId: String(meta.sku_code ?? sku?.id ?? `SKU-${item.sku_id}`),
    backendSkuId: item.sku_id,
    skuName: sku?.name ?? `SKU #${item.sku_id}`,
    qtyDelta,
    newQty: item.event_type === 'PHYSICAL_COUNT' ? item.quantity : undefined,
    sourceSequence: item.source_sequence,
    referenceLabel,
    referenceValue: String(meta.reference ?? item.source),
    destinationOrBin:
      typeof meta.destination_or_bin === 'string'
        ? meta.destination_or_bin
        : undefined,
    conditionOrHandler:
      typeof meta.condition_or_handler === 'string'
        ? meta.condition_or_handler
        : undefined,
    auditNote:
      typeof meta.audit_note === 'string' ? meta.audit_note : undefined,
    status: 'submitted',
    serverConfirmed: true,
    serverId: item.id,
    createdAtIso: item.occurred_at,
    timestampIst,
    attempts: [
      {
        timeIst: timestampIst,
        label: 'Confirmed on Server',
        detail: `DB Event #${item.id} · ${item.source} (seq ${item.source_sequence})`,
        tone: 'success',
      },
    ],
  };
}

/**
 * Merges local events (preserving pending/failed/quarantined queue items) with
 * server-confirmed events from GET /events without duplicates.
 */
export function mergeLocalAndRemoteEvents(
  localEvents: InventoryEvent[],
  remoteEvents: InventoryEvent[]
): InventoryEvent[] {
  const remoteById = new Map<string, InventoryEvent>();
  for (const r of remoteEvents) {
    remoteById.set(r.eventId, r);
  }

  const merged: InventoryEvent[] = [];
  const seen = new Set<string>();

  // Keep local pending/failed/quarantined events unless already confirmed on server
  for (const local of localEvents) {
    if (seen.has(local.eventId)) continue;
    const confirmed = remoteById.get(local.eventId);
    if (confirmed) {
      merged.push(confirmed);
    } else if (local.status !== 'submitted' || !local.serverConfirmed) {
      // Preserve local pending/failed/quarantined or unmerged submitted events
      merged.push(local);
    }
    seen.add(local.eventId);
  }

  for (const remote of remoteEvents) {
    if (!seen.has(remote.eventId)) {
      merged.push(remote);
      seen.add(remote.eventId);
    }
  }

  return merged.sort((a, b) => {
    const tA = new Date(a.createdAtIso).getTime();
    const tB = new Date(b.createdAtIso).getTime();
    return (Number.isNaN(tB) ? 0 : tB) - (Number.isNaN(tA) ? 0 : tA);
  });
}

export function mapFeedStatusToSummary(
  items: BackendFeedStatusItem[],
  preferredSource = 'mobile-manager'
): FeedHealthSummary | null {
  if (items.length === 0) return null;
  const target =
    items.find((f) => f.source === preferredSource) ?? items[0];

  const formatIso = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : formatShortIstTime(d);
  };

  return {
    source: target.source,
    status: target.status,
    isStale: target.is_stale,
    lastHeartbeatIst: formatIso(target.last_heartbeat_at),
    lastEventIst: formatIso(target.last_event_at),
    lastErrorMessage: target.last_error_message,
    recentFailureCount: target.recent_failure_count,
    dataWarning: target.data_warning,
  };
}

export async function fetchStockBalances(
  knownPlants: Plant[],
  knownSkus: SkuItem[],
  token?: string
): Promise<
  | { ok: true; plants: Plant[]; skus: SkuItem[]; count: number }
  | { ok: false; error: string }
> {
  const res = await apiRequest<BackendStockListResponse>('/stock', {
    method: 'GET',
    token,
  });
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  const mapped = mapStockItemsToDomain(res.data.items, knownPlants, knownSkus);
  return {
    ok: true,
    plants: mapped.plants,
    skus: mapped.skus,
    count: res.data.count,
  };
}

export async function fetchEventHistory(
  params: { limit?: number; offset?: number; token?: string },
  plants: Plant[],
  skus: SkuItem[]
): Promise<
  | {
      ok: true;
      total: number;
      limit: number;
      offset: number;
      items: InventoryEvent[];
    }
  | { ok: false; error: string }
> {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const res = await apiRequest<BackendPaginatedEventsResponse>(
    `/events?limit=${limit}&offset=${offset}`,
    { method: 'GET', token: params.token }
  );
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  return {
    ok: true,
    total: res.data.total,
    limit: res.data.limit,
    offset: res.data.offset,
    items: res.data.items.map((item) => mapBackendEventToDomain(item, plants, skus)),
  };
}

export async function fetchFeedHealth(
  token?: string
): Promise<
  | { ok: true; summary: FeedHealthSummary | null; feeds: BackendFeedStatusItem[] }
  | { ok: false; error: string }
> {
  const res = await apiRequest<BackendFeedStatusListResponse>('/feeds/status', {
    method: 'GET',
    token,
  });
  if (!res.ok) {
    return { ok: false, error: res.error.message };
  }
  return {
    ok: true,
    summary: mapFeedStatusToSummary(res.data.feeds),
    feeds: res.data.feeds,
  };
}
