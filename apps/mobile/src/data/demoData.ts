import { InboundShipment, InventoryEvent, Plant, SkuItem } from '../types/inventory';

export const DEMO_PLANTS: Plant[] = [
  {
    id: 'PLT-UDP',
    backendId: 2,
    name: 'Udupi',
    godownLabel: 'Godown B · Line 1',
    sublabel: 'Godown B · Line 1 · Assembly & Dispatch',
  },
];

export const DEMO_SKUS: SkuItem[] = [
  {
    id: 'SKU-MOT-001',
    backendId: 1,
    plantId: 'PLT-UDP',
    backendPlantId: 2,
    name: 'Electric Motor',
    shortDesc: 'Electric Motor · Godown B · Line 1',
    category: 'motor',
    categoryShort: 'Raw',
    unit: 'EA',
    bin: 'Godown B · Line 1',
    onHand: 120,
    reserved: 30,
    availableStock: 90,
  },
  {
    id: 'SKU-FAN-002',
    backendId: 2,
    plantId: 'PLT-UDP',
    backendPlantId: 2,
    name: 'Cooling Fan',
    shortDesc: 'Cooling Fan · Godown B · Line 1',
    category: 'fan',
    categoryShort: 'Fin',
    unit: 'EA',
    bin: 'Godown B · Line 1',
    onHand: 80,
    reserved: 20,
    availableStock: 60,
  },
];

export const DEMO_INBOUND_SHIPMENTS: InboundShipment[] = [
  {
    id: 'SHP-UDP-01',
    plantId: 'PLT-UDP',
    skuId: 'SKU-MOT-001',
    skuName: 'Electric Motor',
    qty: 50,
    expectedTime: '16:00 IST',
    etaTime: '16:00 IST',
    status: 'in_transit',
    poNumber: 'PO-UDP-001',
    isDemo: true,
  },
];

export const DEMO_DISPATCH_DESTINATIONS: string[] = [
  'Godown B · Outbound Dock',
  'Line 1 · Assembly & Dispatch',
];

export const DEMO_EVENTS: InventoryEvent[] = [
  {
    eventId: 'EVT-DEMO-001',
    operation: 'goods_received',
    operationLabel: 'Goods Received',
    plantId: 'PLT-UDP',
    backendPlantId: 2,
    plantName: 'Udupi',
    bin: 'Godown B · Line 1',
    skuId: 'SKU-MOT-001',
    backendSkuId: 1,
    skuName: 'Electric Motor',
    qtyDelta: 50,
    sourceSequence: 1,
    referenceLabel: 'Demo Reference',
    referenceValue: 'DEMO DATA · Inbound Receipt',
    destinationOrBin: 'Godown B · Line 1',
    conditionOrHandler: 'Intact / Pass',
    status: 'submitted',
    serverConfirmed: false,
    isDemo: true,
    createdAtIso: '2026-11-27T04:30:00.000Z',
    timestampIst: '10:00 IST',
    attempts: [
      {
        timeIst: '10:00:00 IST',
        label: 'DEMO DATA (Sample Record)',
        detail: '50 Electric Motors received into Godown B · Line 1',
        tone: 'primary',
      },
    ],
  },
  {
    eventId: 'EVT-DEMO-002',
    operation: 'goods_dispatch',
    operationLabel: 'Goods Dispatch',
    plantId: 'PLT-UDP',
    backendPlantId: 2,
    plantName: 'Udupi',
    bin: 'Godown B · Line 1',
    skuId: 'SKU-FAN-002',
    backendSkuId: 2,
    skuName: 'Cooling Fan',
    qtyDelta: -20,
    sourceSequence: 2,
    referenceLabel: 'Demo Reference',
    referenceValue: 'DEMO DATA · Assembly Dispatch',
    destinationOrBin: 'Line 1 · Assembly & Dispatch',
    conditionOrHandler: 'DEMO Operator',
    status: 'submitted',
    serverConfirmed: false,
    isDemo: true,
    createdAtIso: '2026-11-27T05:30:00.000Z',
    timestampIst: '11:00 IST',
    attempts: [
      {
        timeIst: '11:00:00 IST',
        label: 'DEMO DATA (Sample Record)',
        detail: '20 Cooling Fans dispatched from Godown B · Line 1',
        tone: 'primary',
      },
    ],
  },
];
