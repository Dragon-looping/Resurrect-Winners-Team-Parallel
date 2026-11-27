export type ScreenName =
  | 'Login'
  | 'Dashboard'
  | 'PlantSkuSelection'
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
  qty: number;
  expectedTime: string;
  etaTime: string;
  status: 'on_time' | 'delayed';
  poNumber: string;
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
  name?: string;
  role?: string;
  token?: string;
  isDevMode?: boolean;
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
