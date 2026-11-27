export type ScreenName =
  | 'Login'
  | 'Dashboard'
  | 'PlantSkuSelection'
  | 'WarehouseNetwork'
  | 'GoodsReceived'
  | 'GoodsDispatch'
  | 'PhysicalStockCorrection'
  | 'InventoryEventHistory'
  | 'EventDetailsRetry';

export type SkuCategory = 'motor' | 'fan';

export interface Plant {
  id: string;
  backendId: number;
  name: string;
  godownLabel: string;
  sublabel: string;
}

export interface SkuItem {
  id: string;
  backendId: number;
  plantId: string;
  backendPlantId: number;
  name: string;
  shortDesc: string;
  category: SkuCategory;
  categoryShort: 'Raw' | 'Fin';
  unit: string;
  bin: string;
  onHand: number;
  reserved: number;
  confirmedArrivals?: number;
  availableStock?: number;
  minThreshold?: number;
}

export interface InboundShipment {
  id: string;
  plantId: string;
  skuId: string;
  skuName?: string;
  qty: number;
  expectedTime: string;
  etaTime: string;
  status: 'on_time' | 'delayed' | 'in_transit';
  poNumber: string;
  isDemo?: boolean;
}

export type EventOperation =
  | 'goods_received'
  | 'goods_dispatch'
  | 'stock_correction';

export type EventStatus = 'pending' | 'submitted' | 'failed';

export interface EventAttempt {
  timeIst: string;
  label: string;
  detail: string;
  tone: 'primary' | 'warning' | 'error' | 'success';
}

export interface InventoryEvent {
  eventId: string;
  operation: EventOperation;
  operationLabel: string;
  plantId: string;
  backendPlantId: number;
  plantName: string;
  bin: string;
  skuId: string;
  backendSkuId: number;
  skuName: string;
  qtyDelta: number;
  previousQty?: number;
  newQty?: number;
  sourceSequence: number;
  referenceLabel: string;
  referenceValue: string;
  destinationOrBin?: string;
  conditionOrHandler?: string;
  auditNote?: string;
  status: EventStatus;
  serverConfirmed?: boolean;
  serverId?: number;
  isDemo?: boolean;
  quarantined?: boolean;
  quarantinedEventId?: number;
  createdAtIso: string;
  timestampIst: string;
  attempts: EventAttempt[];
  errorDiagnostics?: {
    code: string;
    message: string;
  };
}

export interface AuthUser {
  email: string;
  loginId?: string;
  name?: string;
  role?: string;
  plantId?: number;
  plantName?: string;
  plantLocation?: string;
  token?: string;
  isDevMode?: boolean;
}

export type InterWarehouseRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED'
  | 'DISPATCHED'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'CANCELLED';

export interface NetworkAvailabilityItem {
  plant_id: number;
  plant_name: string;
  plant_location: string;
  sku_id: number;
  sku_code: string;
  sku_name: string;
  unit: string;
  available_stock: number;
  availability_status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  updated_at: string | null;
}

export interface InterWarehouseRequest {
  id: number;
  request_code: string;
  requesting_plant_id: number;
  requesting_plant_name: string;
  supplying_plant_id: number;
  supplying_plant_name: string;
  sku_id: number;
  sku_code: string;
  sku_name: string;
  unit: string;
  requested_qty: number;
  approved_qty: number | null;
  dispatched_qty: number;
  received_qty: number;
  status: InterWarehouseRequestStatus;
  reason: string | null;
  rejection_reason: string | null;
  dispatch_event_id: number | null;
  receipt_event_id: number | null;
  created_at: string;
  updated_at: string;
}

export type BackendFeedStatus = 'HEALTHY' | 'STALE' | 'DEGRADED' | 'UNKNOWN';

export interface FeedHealthSummary {
  source: string;
  status: BackendFeedStatus;
  isStale: boolean;
  lastHeartbeatIst: string | null;
  lastEventIst: string | null;
  lastErrorMessage: string | null;
  recentFailureCount: number;
  dataWarning: string | null;
}
