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
  name: string;
  godownLabel: string;
  sublabel: string;
}

export interface SkuItem {
  id: string;
  plantId: string;
  name: string;
  shortDesc: string;
  category: SkuCategory;
  categoryShort: 'Raw' | 'Fin';
  bin: string;
  onHand: number;
  reserved: number;
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
  plantName: string;
  bin: string;
  skuId: string;
  skuName: string;
  qtyDelta: number;
  previousQty?: number;
  newQty?: number;
  referenceLabel: string;
  referenceValue: string;
  destinationOrBin?: string;
  conditionOrHandler?: string;
  auditNote?: string;
  status: EventStatus;
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
}
