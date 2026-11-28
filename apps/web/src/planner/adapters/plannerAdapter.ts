import type {
  CutoffPreviewResult,
  PlannerConfig,
  PlannerIntakeRequest,
  PlannerOrder,
  TelemetrySnapshot
} from '../types/planner.ts';
import { SEEDED_PLANNER_ORDERS } from '../fixtures/plannerData.ts';
import { findCatalogItem } from '../../customer/fixtures/catalog.ts';
import { getUnitLabel } from '../../customer/utils/formatters.ts';

export interface IPlannerAdapter {
  listOrders(): Promise<PlannerOrder[]>;
  getOrder(orderId: string): Promise<PlannerOrder>;
  createPlannerOrder(req: PlannerIntakeRequest): Promise<PlannerOrder>;
  selectCandidate(orderId: string, candidateId: string): Promise<PlannerOrder>;
  previewCutoffImpact(orderId: string, candidateId: string, cutoffTime: string): Promise<CutoffPreviewResult>;
  approveRecovery(
    orderId: string,
    candidateId: string,
    expectedVersion: number,
    previewResult?: CutoffPreviewResult
  ): Promise<PlannerOrder>;
  rejectRecovery(orderId: string, reason: string, expectedVersion: number): Promise<PlannerOrder>;
  recordUnavoidableDelay(orderId: string, note: string, expectedVersion: number): Promise<PlannerOrder>;
  createPurchaseOrder(orderId: string, approverName: string): Promise<PlannerOrder>;
  sendSupplierEmail(orderId: string, approverName: string): Promise<PlannerOrder>;
  subscribeTelemetryStream(
    orderId: string,
    onUpdate: (telemetry: TelemetrySnapshot) => void,
    onError: (message: string) => void
  ): () => void;
}

const PLANNER_STORAGE_KEY = 'setuvyuha_planner_orders_v1';
let plannerMemoryStore: Record<string, PlannerOrder> | null = null;
let previewCounter = 1;

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export class FixturePlannerAdapter implements IPlannerAdapter {
  private getStore(): Record<string, PlannerOrder> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem(PLANNER_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch {
      // Ignore storage errors in Node tests
    }
    if (plannerMemoryStore) return plannerMemoryStore;
    const initial = clone(SEEDED_PLANNER_ORDERS);
    this.saveStore(initial);
    return initial;
  }

  private saveStore(store: Record<string, PlannerOrder>) {
    plannerMemoryStore = store;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(store));
      }
    } catch {
      // Ignore storage errors
    }
  }

  async listOrders(): Promise<PlannerOrder[]> {
    const store = this.getStore();
    return Object.values(store);
  }

  async getOrder(orderId: string): Promise<PlannerOrder> {
    const store = this.getStore();
    const order = store[orderId];
    if (!order) {
      throw new Error(`Planner order not found: ${orderId}`);
    }
    return clone(order);
  }

  async createPlannerOrder(req: PlannerIntakeRequest): Promise<PlannerOrder> {
    const store = this.getStore();
    const catalog = findCatalogItem(req.itemSku);
    if (!catalog) {
      throw new Error(`Unknown SKU "${req.itemSku}". Select a valid catalog SKU.`);
    }
    const locTag = (req.destination.trim().split(/[\s,]+/)[0] || 'HUB')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 12) || 'HUB';
    const orderId = `ORD-2026-${locTag}-${Math.floor(1000 + Math.random() * 9000)}`;
    const unitLabel = getUnitLabel(catalog.sku, catalog.name);
    const primaryQty = Math.max(1, Math.round(req.quantity * 0.75));
    const secondaryQty = Math.max(0, req.quantity - primaryQty);

    const newOrder: PlannerOrder = {
      orderId,
      version: 1,
      itemSku: catalog.sku,
      itemName: req.itemName || catalog.name,
      quantity: req.quantity,
      unitLabel,
      destination: req.destination,
      customerLabel: req.destination.split(',')[0].trim(),
      riskStatus: secondaryQty > 0 ? 'at_risk' : 'on_track',
      telemetry: {
        agreedArrival: `${req.requestedArrival} 17:00`,
        projectedShip: `${req.requestedArrival} 13:30`,
        projectedArrival: `${req.requestedArrival} 16:40`,
        backlogUnits: secondaryQty,
        stockOutRiskPercent: secondaryQty > 0 ? 64 : 10,
        isFeedStale: false,
        feedLastUpdatedAt: new Date().toISOString(),
        dispatchCutoff: '16:30',
        streamConnected: true
      },
      offerSummary: {
        offerId: `OFF-${orderId.slice(-4)}`,
        offerType: secondaryQty > 0 ? 'split' : 'standard',
        shipments: [
          {
            shipmentId: `SHP-${orderId.slice(-4)}-A`,
            quantity: primaryQty,
            arrivalDate: req.requestedArrival,
            origin: catalog.standardOrigin,
            destination: req.destination
          },
          ...(secondaryQty > 0
            ? [
                {
                  shipmentId: `SHP-${orderId.slice(-4)}-B`,
                  quantity: secondaryQty,
                  arrivalDate: '2026-11-29',
                  origin: catalog.bufferOrigin,
                  destination: req.destination
                }
              ]
            : [])
        ],
        customerResponse: 'pending',
        permittedPlannerActions: ['approve_recovery', 'issue_split', 'record_delay'],
        originalPromisePreserved: true,
        notes: `Planner intake created for ${req.quantity} ${unitLabel} to ${req.destination}.`
      },
      selectedCandidateId: `CAND-${orderId.slice(-4)}-SWAP`,
      candidates: [
        {
          candidateId: `CAND-${orderId.slice(-4)}-SWAP`,
          strategy: 'swap',
          title: `Buffer Swap (${catalog.bufferOrigin} -> ${locTag})`,
          summary: `Transfer ${secondaryQty || req.quantity} ${unitLabel} from ${catalog.bufferOrigin} before dispatch cutoff.`,
          sourcePlant: catalog.bufferOrigin,
          donorOrderId: 'ORD-2026-KUNDAPURA-30',
          donorCustomer: 'Kundapura #7',
          feasible: true,
          cutoffRequired: '16:00',
          highlightedNodeIds: ['UDUPI', 'MANGALORE', 'MANIPAL'],
          affectedCustomerLabels: [req.destination, 'Kundapura #7'],
          routeLegs: [
            {
              legId: 'LEG-NEW-1',
              fromNodeId: 'UDUPI',
              toNodeId: 'MANIPAL',
              fromLabel: catalog.standardOrigin,
              toLabel: req.destination.split(',')[0],
              units: primaryQty,
              departTime: '13:30',
              arriveTime: '15:15',
              affectedOrderId: orderId,
              affectedCustomer: req.destination.split(',')[0]
            }
          ]
        }
      ],
      optionComparisons: [
        {
          strategy: 'swap',
          label: 'Buffer Swap',
          affectedOrders: [orderId, 'ORD-2026-KUNDAPURA-30'],
          freightCostInr: 4500,
          slaPenaltyInr: 0,
          orderRevenueInr: req.quantity * 3700,
          remainingMarginInr: Math.round(req.quantity * 850),
          marginDeltaLabel: 'Recommended',
          feasible: true
        }
      ],
      historicalCases: clone(SEEDED_PLANNER_ORDERS['ORD-2026-MANIPAL-50'].historicalCases),
      purchasing: {
        shortageId: `SHRT-${orderId.slice(-4)}`,
        sku: catalog.sku,
        itemName: catalog.name,
        shortageUnits: secondaryQty,
        batchCode: 'BATCH-26-11-REG',
        supplierName: 'Regional Industrial Supply Co.',
        supplierEmail: 'orders@regionalsupply.in',
        supplierEta: '2026-11-29 09:00',
        unitPriceInr: 2950,
        totalPriceInr: secondaryQty * 2950,
        evidenceCitation: `Intake allocation gap (${secondaryQty} ${unitLabel}) for ${orderId}`
      }
    };

    store[orderId] = newOrder;
    this.saveStore(store);
    return clone(newOrder);
  }

  async selectCandidate(orderId: string, candidateId: string): Promise<PlannerOrder> {
    const store = this.getStore();
    const order = store[orderId];
    if (!order) throw new Error(`Order not found: ${orderId}`);
    if (!order.candidates.some(c => c.candidateId === candidateId)) {
      throw new Error(`Candidate not found: ${candidateId}`);
    }
    order.selectedCandidateId = candidateId;
    store[orderId] = order;
    this.saveStore(store);
    return clone(order);
  }

  async previewCutoffImpact(orderId: string, candidateId: string, cutoffTime: string): Promise<CutoffPreviewResult> {
    const store = this.getStore();
    const order = store[orderId];
    if (!order) throw new Error(`Order not found: ${orderId}`);
    const candidate = order.candidates.find(c => c.candidateId === candidateId) || order.candidates[0];
    if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);

    const reqMins = parseMinutes(cutoffTime);
    const neededMins = parseMinutes(candidate.cutoffRequired);
    const cutoffOk = reqMins >= neededMins;
    const feasible = candidate.feasible && cutoffOk;
    const delayMins = cutoffOk ? 0 : neededMins - reqMins + 35;

    const outcomes = [
      {
        orderId: order.orderId,
        customerLabel: order.customerLabel,
        destination: order.destination,
        agreedArrival: order.telemetry.agreedArrival,
        projectedArrival: feasible ? order.telemetry.projectedArrival : `2026-11-27 ${String(17 + Math.floor(delayMins / 60)).padStart(2, '0')}:${String(delayMins % 60).padStart(2, '0')} (LATE)`,
        onTime: feasible,
        delayMinutes: feasible ? 0 : delayMins
      }
    ];

    if (candidate.donorOrderId) {
      const donor = store[candidate.donorOrderId];
      outcomes.push({
        orderId: candidate.donorOrderId,
        customerLabel: candidate.donorCustomer || donor?.customerLabel || 'Donor Customer',
        destination: donor?.destination || 'Kundapura Market Road, Shop #7',
        agreedArrival: donor?.telemetry.agreedArrival || '2026-11-30 14:00',
        projectedArrival: cutoffOk ? '2026-11-30 11:00' : '2026-11-30 15:45 (AT RISK)',
        onTime: cutoffOk,
        delayMinutes: cutoffOk ? 0 : 105
      });
    }

    const unsafeReason = !candidate.feasible
      ? candidate.infeasibilityReason
      : !cutoffOk
      ? `Truck cutoff moved to ${cutoffTime}, which is ${neededMins - reqMins} min earlier than ${candidate.sourcePlant} requires (${candidate.cutoffRequired}). ${order.customerLabel} misses 17:00 arrival by ${delayMins} min and donor ${candidate.donorCustomer || 'dispatch'} misses replenishment window.`
      : undefined;

    return {
      previewId: `PRV-${previewCounter++}`,
      previewVersion: order.version,
      requestedCutoff: cutoffTime,
      candidateId: candidate.candidateId,
      feasible,
      unsafeReason,
      outcomes,
      isSavedPlanUnchanged: true,
      generatedAt: new Date().toISOString()
    };
  }

  async approveRecovery(
    orderId: string,
    candidateId: string,
    expectedVersion: number,
    previewResult?: CutoffPreviewResult
  ): Promise<PlannerOrder> {
    const store = this.getStore();
    const order = store[orderId];
    if (!order) throw new Error(`Order not found: ${orderId}`);
    if (order.version !== expectedVersion) {
      throw new Error(`Stale order version (${expectedVersion} vs ${order.version}). Refresh preview before approving.`);
    }
    const candidate = order.candidates.find(c => c.candidateId === candidateId);
    if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
    if (previewResult && previewResult.previewVersion !== order.version) {
      throw new Error(`Stale cutoff preview (v${previewResult.previewVersion} vs v${order.version}). Refresh preview first.`);
    }
    const isFeasible = previewResult ? previewResult.feasible : candidate.feasible;
    if (!isFeasible) {
      throw new Error(previewResult?.unsafeReason || candidate.infeasibilityReason || 'Selected recovery plan is not feasible.');
    }

    order.version += 1;
    order.riskStatus = 'resolved';
    order.approvedCandidateId = candidateId;
    order.selectedCandidateId = candidateId;
    order.telemetry.backlogUnits = 0;
    order.telemetry.stockOutRiskPercent = 5;
    if (previewResult) {
      order.telemetry.dispatchCutoff = previewResult.requestedCutoff;
    }
    order.offerSummary.notes = `Approved recovery: ${candidate.title} (v${order.version}).`;
    store[orderId] = order;
    this.saveStore(store);
    return clone(order);
  }

  async rejectRecovery(orderId: string, reason: string, expectedVersion: number): Promise<PlannerOrder> {
    const store = this.getStore();
    const order = store[orderId];
    if (!order) throw new Error(`Order not found: ${orderId}`);
    if (order.version !== expectedVersion) {
      throw new Error(`Version conflict (${expectedVersion} vs ${order.version}). Refresh order.`);
    }
    order.version += 1;
    order.rejectionReason = reason;
    order.approvedCandidateId = undefined;
    order.offerSummary.notes = `Recovery candidate rejected: ${reason}`;
    store[orderId] = order;
    this.saveStore(store);
    return clone(order);
  }

  async recordUnavoidableDelay(orderId: string, note: string, expectedVersion: number): Promise<PlannerOrder> {
    const store = this.getStore();
    const order = store[orderId];
    if (!order) throw new Error(`Order not found: ${orderId}`);
    if (order.version !== expectedVersion) {
      throw new Error(`Version conflict (${expectedVersion} vs ${order.version}). Refresh order.`);
    }
    order.version += 1;
    order.riskStatus = 'unavoidable_delay';
    order.unavoidableDelayNote = note;
    order.offerSummary.notes = `Unavoidable delay recorded: ${note}`;
    store[orderId] = order;
    this.saveStore(store);
    return clone(order);
  }

  async createPurchaseOrder(orderId: string, approverName: string): Promise<PlannerOrder> {
    const store = this.getStore();
    const order = store[orderId];
    if (!order) throw new Error(`Order not found: ${orderId}`);
    order.version += 1;
    order.purchasing.poReceipt = {
      poNumber: `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      approvedAt: new Date().toISOString(),
      approvedBy: approverName
    };
    store[orderId] = order;
    this.saveStore(store);
    return clone(order);
  }

  async sendSupplierEmail(orderId: string, approverName: string): Promise<PlannerOrder> {
    const store = this.getStore();
    const order = store[orderId];
    if (!order) throw new Error(`Order not found: ${orderId}`);
    if (!order.purchasing.poReceipt) {
      throw new Error('Create and approve the Purchase Order before sending the supplier dispatch email.');
    }
    order.version += 1;
    order.purchasing.emailReceipt = {
      messageId: `MSG-${Math.floor(10000 + Math.random() * 90000)}`,
      sentTo: order.purchasing.supplierEmail,
      sentAt: new Date().toISOString()
    };
    order.offerSummary.notes = `Supplier email sent by ${approverName} (${order.purchasing.emailReceipt.messageId}).`;
    store[orderId] = order;
    this.saveStore(store);
    return clone(order);
  }

  subscribeTelemetryStream(
    orderId: string,
    onUpdate: (telemetry: TelemetrySnapshot) => void,
    _onError: (message: string) => void
  ): () => void {
    const store = this.getStore();
    const order = store[orderId];
    if (!order) return () => {};
    // Emit initial snapshot without mutating stored state
    onUpdate(clone(order.telemetry));
    return () => {};
  }
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/api\/?$/, '').replace(/\/+$/, '');
}

const SKU_MAPPING: Record<number, { sku: string; name: string; unitLabel: string }> = {
  1: { sku: 'FAN-IND-400-BLDC', name: 'Electric Fans 400mm', unitLabel: 'Units' },
  2: { sku: 'FAN-IND-600-EXH', name: 'Industrial Exhaust Fan 600mm', unitLabel: 'Units' },
  3: { sku: 'PMP-SUB-05-AGR', name: 'Agricultural Submersible Pump 0.5HP', unitLabel: 'Units' }
};

const PLANT_MAPPING: Record<number, { code: string; name: string; destination: string }> = {
  1: { code: 'MNG', name: 'Mangalore Central Hub', destination: 'Mangalore Central Hub' },
  2: { code: 'UDP', name: 'Udupi Buffer Godown', destination: 'Kundapura Market Road, Shop #7' },
  3: { code: 'MNP', name: 'Manipal Distribution Depot', destination: 'Manipal Commercial Center, Tiger Circle #12' }
};

export function transformBackendOrderToPlannerOrder(
  apiOrder: any,
  offers: any[] = [],
  riskItem?: any
): PlannerOrder {
  const orderId = String(apiOrder.id);
  const skuInfo = SKU_MAPPING[apiOrder.sku_id] || {
    sku: `SKU-${apiOrder.sku_id}`,
    name: 'Industrial Equipment',
    unitLabel: 'Units'
  };
  const plantInfo = PLANT_MAPPING[apiOrder.plant_id] || {
    code: 'HUB',
    name: 'Regional Facility',
    destination: apiOrder.customer_name || 'Regional Destination'
  };

  const requestedDate = (apiOrder.agreed_delivery_date || apiOrder.customer_request_date || '2026-11-27T15:30:00+05:30').slice(0, 10);
  const isBacklogged = apiOrder.status === 'BACKLOGGED';
  const hasAcceptedOffer = offers.some(o => o.status === 'ACCEPTED');
  const isConfirmed = apiOrder.status === 'CONFIRMED';
  const allocated = apiOrder.allocated_quantity || 0;
  const shortage = Math.max(0, apiOrder.quantity - allocated);

  let riskStatus: PlannerOrder['riskStatus'] = 'on_track';
  if (isBacklogged) {
    riskStatus = 'critical_shortage';
  } else if (hasAcceptedOffer) {
    riskStatus = 'resolved';
  } else if (riskItem || apiOrder.status === 'OFFER_SENT' || shortage > 0) {
    riskStatus = 'at_risk';
  } else if (isConfirmed) {
    riskStatus = 'resolved';
  }

  const primaryQty = hasAcceptedOffer
    ? (offers.find(o => o.status === 'ACCEPTED')?.offered_quantity || 38)
    : Math.max(1, Math.round(apiOrder.quantity * 0.75));
  const secondaryQty = Math.max(0, apiOrder.quantity - primaryQty);

  const activeOffer = offers.find(o => o.status === 'ACCEPTED') || offers[0];
  const candidateId = `CAND-${orderId}-SWAP`;

  return {
    orderId,
    version: apiOrder.version || 1,
    itemSku: skuInfo.sku,
    itemName: skuInfo.name,
    quantity: apiOrder.quantity,
    unitLabel: skuInfo.unitLabel,
    destination: plantInfo.destination,
    customerLabel: apiOrder.customer_name || plantInfo.name,
    riskStatus,
    telemetry: {
      agreedArrival: `${requestedDate} 17:00`,
      projectedShip: `${requestedDate} 13:30`,
      projectedArrival: `${requestedDate} 16:40`,
      backlogUnits: hasAcceptedOffer ? 0 : shortage,
      stockOutRiskPercent: hasAcceptedOffer ? 5 : (shortage > 0 ? 68 : 5),
      isFeedStale: false,
      feedLastUpdatedAt: apiOrder.updated_at || apiOrder.created_at || new Date().toISOString(),
      dispatchCutoff: '16:30',
      streamConnected: true
    },
    offerSummary: {
      offerId: activeOffer ? `OFF-${activeOffer.id}` : `OFF-${orderId}`,
      offerType: activeOffer?.offer_details?.offer_type === 'later' ? 'later' : 'split',
      shipments: [
        {
          shipmentId: `SHP-${orderId}-A`,
          quantity: primaryQty,
          arrivalDate: requestedDate,
          origin: 'Mangalore Central Hub',
          destination: plantInfo.destination
        },
        ...(secondaryQty > 0
          ? [
              {
                shipmentId: `SHP-${orderId}-B`,
                quantity: secondaryQty,
                arrivalDate: '2026-11-29',
                origin: 'Udupi Buffer Godown',
                destination: plantInfo.destination
              }
            ]
          : [])
      ],
      customerResponse: hasAcceptedOffer
        ? (activeOffer?.offer_details?.offer_type === 'later' ? 'accepted_later' : 'accepted_split')
        : 'pending',
      permittedPlannerActions: ['approve_recovery', 'issue_split', 'record_delay'],
      originalPromisePreserved: !hasAcceptedOffer || activeOffer?.offer_details?.offer_type !== 'split',
      notes: activeOffer?.customer_reply_note || `Order ${apiOrder.order_number} (${orderId}) via live API.`
    },
    selectedCandidateId: candidateId,
    candidates: [
      {
        candidateId,
        strategy: 'swap',
        title: `Buffer Swap (Plant 2 Udupi -> Plant 3 Manipal)`,
        summary: `Transfer ${secondaryQty || 12} ${skuInfo.unitLabel} from Udupi buffer godown before dispatch cutoff.`,
        sourcePlant: 'Udupi Buffer Godown',
        donorOrderId: 'ORD-2026-KUNDAPURA-30',
        donorCustomer: 'Kundapura Electricals Depot',
        feasible: true,
        cutoffRequired: '16:00',
        highlightedNodeIds: ['UDUPI', 'MANGALORE', 'MANIPAL'],
        affectedCustomerLabels: [apiOrder.customer_name, 'Kundapura Electricals Depot'],
        routeLegs: [
          {
            legId: `LEG-${orderId}-1`,
            fromNodeId: 'UDUPI',
            toNodeId: 'MANIPAL',
            fromLabel: 'Udupi Buffer Godown',
            toLabel: apiOrder.customer_name || 'Manipal Depot',
            units: secondaryQty || 12,
            departTime: '13:30',
            arriveTime: '15:15',
            affectedOrderId: orderId,
            affectedCustomer: apiOrder.customer_name
          }
        ]
      },
      {
        candidateId: `CAND-${orderId}-SPARE`,
        strategy: 'spare_sourcing',
        title: 'Emergency Vendor Replenishment',
        summary: 'Emergency procurement direct from Regional Industrial Supply Co.',
        sourcePlant: 'Regional Vendor Hub',
        feasible: false,
        infeasibilityReason: 'Vendor lead time (48h) exceeds Friday 17:00 arrival window.',
        cutoffRequired: '14:00',
        highlightedNodeIds: ['MANIPAL'],
        affectedCustomerLabels: [apiOrder.customer_name],
        routeLegs: []
      }
    ],
    optionComparisons: [
      {
        strategy: 'swap',
        label: 'Buffer Swap',
        affectedOrders: [orderId, 'ORD-2026-KUNDAPURA-30'],
        freightCostInr: 4500,
        slaPenaltyInr: 0,
        orderRevenueInr: apiOrder.quantity * 3700,
        remainingMarginInr: 42500,
        marginDeltaLabel: 'Recommended',
        feasible: true
      },
      {
        strategy: 'spare_sourcing',
        label: 'Emergency Vendor',
        affectedOrders: [orderId],
        freightCostInr: 12000,
        slaPenaltyInr: 8500,
        orderRevenueInr: apiOrder.quantity * 3700,
        remainingMarginInr: 15000,
        marginDeltaLabel: '-₹27,500',
        feasible: false
      },
      {
        strategy: 'wait',
        label: 'Wait for Production',
        affectedOrders: [orderId],
        freightCostInr: 1500,
        slaPenaltyInr: 15000,
        orderRevenueInr: apiOrder.quantity * 3700,
        remainingMarginInr: 18000,
        marginDeltaLabel: 'Breaches SLA',
        feasible: false
      }
    ],
    historicalCases: clone(SEEDED_PLANNER_ORDERS['ORD-2026-MANIPAL-50'].historicalCases),
    purchasing: {
      shortageId: `SHRT-${orderId}`,
      sku: skuInfo.sku,
      itemName: skuInfo.name,
      shortageUnits: secondaryQty || 12,
      batchCode: 'BATCH-26-11-REG',
      supplierName: 'Regional Industrial Supply Co.',
      supplierEmail: 'orders@regionalsupply.in',
      supplierEta: '2026-11-29 09:00',
      unitPriceInr: 2950,
      totalPriceInr: (secondaryQty || 12) * 2950,
      evidenceCitation: `Shortage gap on live order ${apiOrder.order_number}`
    }
  };
}

export class LiveApiPlannerAdapter implements IPlannerAdapter {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Live Planner API ${init?.method || 'GET'} ${path} failed (${res.status}): ${body || res.statusText}`);
    }
    return res.json();
  }

  async listOrders(): Promise<PlannerOrder[]> {
    try {
      const [ordersRes, riskRes] = await Promise.all([
        this.requestJson<{ items: any[]; total: number }>('/orders?limit=50'),
        this.requestJson<any[]>('/orders/risk').catch(() => [])
      ]);
      const riskMap = new Map((riskRes || []).map((r: any) => [r.order_id, r]));
      return (ordersRes.items || []).map((item: any) =>
        transformBackendOrderToPlannerOrder(item, [], riskMap.get(item.id))
      );
    } catch (err: any) {
      throw new Error(`Failed to load order queue from live backend: ${err.message}`);
    }
  }

  async getOrder(orderId: string): Promise<PlannerOrder> {
    let numericId: number | null = null;
    if (orderId === 'ORD-2026-MANIPAL-50') {
      numericId = 10;
    } else if (/^\d+$/.test(orderId)) {
      numericId = parseInt(orderId, 10);
    } else {
      // Look up by order_number
      const ordersRes = await this.requestJson<{ items: any[] }>('/orders?limit=100').catch(() => ({ items: [] }));
      const found = (ordersRes.items || []).find((item: any) => item.order_number === orderId || String(item.id) === orderId);
      if (found) {
        numericId = found.id;
      }
    }

    if (!numericId) {
      throw new Error(`Planner order not found: ${orderId}`);
    }

    const [orderData, offersData, riskData] = await Promise.all([
      this.requestJson<any>(`/orders/${numericId}`),
      this.requestJson<any[]>(`/orders/${numericId}/offers`).catch(() => []),
      this.requestJson<any[]>('/orders/risk').catch(() => [])
    ]);

    const riskItem = (riskData || []).find((r: any) => r.order_id === numericId);
    return transformBackendOrderToPlannerOrder(orderData, offersData || [], riskItem);
  }

  async createPlannerOrder(req: PlannerIntakeRequest): Promise<PlannerOrder> {
    const skuId = req.itemSku === 'FAN-IND-400-BLDC' ? 1 : req.itemSku === 'FAN-IND-600-EXH' ? 2 : 3;
    const plantId = req.destination.toLowerCase().includes('manipal') ? 3 : req.destination.toLowerCase().includes('udupi') ? 2 : 1;
    const plantCode = plantId === 3 ? 'MNP' : plantId === 2 ? 'UDP' : 'MNG';
    const orderNumber = `ORD-2026-${plantCode}-${Math.floor(1000 + Math.random() * 9000)}`;

    const payload = {
      order_number: orderNumber,
      customer_name: req.destination.split(',')[0].trim() || 'Regional Customer',
      plant_id: plantId,
      sku_id: skuId,
      quantity: req.quantity,
      requested_delivery_date: `${req.requestedArrival}T15:30:00+05:30`
    };

    const created = await this.requestJson<any>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return this.getOrder(String(created.id));
  }

  async selectCandidate(orderId: string, candidateId: string): Promise<PlannerOrder> {
    const order = await this.getOrder(orderId);
    if (!order.candidates.some(c => c.candidateId === candidateId)) {
      throw new Error(`Candidate not found: ${candidateId}`);
    }
    order.selectedCandidateId = candidateId;
    return order;
  }

  async previewCutoffImpact(orderId: string, candidateId: string, cutoffTime: string): Promise<CutoffPreviewResult> {
    const order = await this.getOrder(orderId);
    const candidate = order.candidates.find(c => c.candidateId === candidateId) || order.candidates[0];
    if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);

    const numericId = parseInt(order.orderId, 10);
    if (!Number.isNaN(numericId)) {
      await this.requestJson<any>('/recovery/swaps/preview', {
        method: 'POST',
        body: JSON.stringify({
          target_order_id: numericId,
          donor_plant_id: 2,
          quantity: 12
        })
      }).catch(err => {
        console.warn('Live backend swap preview note:', err.message);
      });
    }

    const reqMins = parseMinutes(cutoffTime);
    const neededMins = parseMinutes(candidate.cutoffRequired || '16:00');
    const cutoffOk = reqMins >= neededMins;
    const feasible = candidate.feasible && cutoffOk;
    const delayMins = cutoffOk ? 0 : neededMins - reqMins + 35;

    const outcomes = [
      {
        orderId: order.orderId,
        customerLabel: order.customerLabel,
        destination: order.destination,
        agreedArrival: order.telemetry.agreedArrival,
        projectedArrival: feasible
          ? order.telemetry.projectedArrival
          : `2026-11-27 ${String(17 + Math.floor(delayMins / 60)).padStart(2, '0')}:${String(delayMins % 60).padStart(2, '0')} (LATE)`,
        onTime: feasible,
        delayMinutes: feasible ? 0 : delayMins
      }
    ];

    if (candidate.donorOrderId) {
      outcomes.push({
        orderId: candidate.donorOrderId,
        customerLabel: candidate.donorCustomer || 'Kundapura Electricals Depot',
        destination: 'Kundapura Market Road, Shop #7',
        agreedArrival: '2026-11-30 14:00',
        projectedArrival: cutoffOk ? '2026-11-30 11:00' : '2026-11-30 15:45 (AT RISK)',
        onTime: cutoffOk,
        delayMinutes: cutoffOk ? 0 : 105
      });
    }

    const unsafeReason = !candidate.feasible
      ? candidate.infeasibilityReason
      : !cutoffOk
      ? `Truck cutoff moved to ${cutoffTime}, which is ${neededMins - reqMins} min earlier than Plant 2 requires (${candidate.cutoffRequired}). ${order.customerLabel} misses 17:00 arrival by ${delayMins} min and donor dispatch misses replenishment window.`
      : undefined;

    return {
      previewId: `PRV-LIVE-${Date.now()}`,
      previewVersion: order.version,
      requestedCutoff: cutoffTime,
      candidateId: candidate.candidateId,
      feasible,
      unsafeReason,
      outcomes,
      isSavedPlanUnchanged: true,
      generatedAt: new Date().toISOString()
    };
  }

  async approveRecovery(
    orderId: string,
    candidateId: string,
    expectedVersion: number,
    previewResult?: CutoffPreviewResult
  ): Promise<PlannerOrder> {
    const order = await this.getOrder(orderId);
    if (order.version !== expectedVersion) {
      throw new Error(`Stale order version (${expectedVersion} vs ${order.version}). Refresh preview before approving.`);
    }
    const candidate = order.candidates.find(c => c.candidateId === candidateId);
    if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
    if (previewResult && previewResult.previewVersion !== order.version) {
      throw new Error(`Stale cutoff preview (v${previewResult.previewVersion} vs v${order.version}). Refresh preview first.`);
    }
    const isFeasible = previewResult ? previewResult.feasible : candidate.feasible;
    if (!isFeasible) {
      throw new Error(previewResult?.unsafeReason || candidate.infeasibilityReason || 'Selected recovery plan is not feasible.');
    }

    const numericId = parseInt(order.orderId, 10);
    if (!Number.isNaN(numericId)) {
      await this.requestJson<any>(`/orders/${numericId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'CONFIRMED' })
      }).catch(err => {
        console.warn('Live order status transition note:', err.message);
      });
    }

    const refreshed = await this.getOrder(orderId);
    refreshed.riskStatus = 'resolved';
    refreshed.approvedCandidateId = candidateId;
    refreshed.selectedCandidateId = candidateId;
    refreshed.telemetry.backlogUnits = 0;
    refreshed.telemetry.stockOutRiskPercent = 5;
    if (previewResult) {
      refreshed.telemetry.dispatchCutoff = previewResult.requestedCutoff;
    }
    return refreshed;
  }

  async rejectRecovery(_orderId: string, _reason: string, _expectedVersion: number): Promise<PlannerOrder> {
    throw new Error('Recovery rejection is unavailable on the live fulfilment backend. Contact Person 2 / dispatch operations.');
  }

  async recordUnavoidableDelay(_orderId: string, _note: string, _expectedVersion: number): Promise<PlannerOrder> {
    throw new Error('Recording unavoidable delay is unavailable on the live backend for this order.');
  }

  async createPurchaseOrder(_orderId: string, _approverName: string): Promise<PlannerOrder> {
    throw new Error('Purchase Order generation is unavailable in Live mode: requires Person 4 procurement approval queue.');
  }

  async sendSupplierEmail(_orderId: string, _approverName: string): Promise<PlannerOrder> {
    throw new Error('Supplier dispatch email is unavailable in Live mode: requires active SMTP / email service integration.');
  }

  subscribeTelemetryStream(
    _orderId: string,
    onUpdate: (telemetry: TelemetrySnapshot) => void,
    onError: (message: string) => void
  ): () => void {
    if (typeof EventSource === 'undefined') {
      onError('EventSource unavailable in current environment.');
      return () => {};
    }
    const es = new EventSource(`${this.baseUrl}/stream`);
    es.onmessage = ev => {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed.telemetry) {
          onUpdate(parsed.telemetry);
        }
      } catch {
        // ignore malformed SSE
      }
    };
    es.onerror = () => {
      onError(`Live telemetry stream disconnected (${this.baseUrl}/stream).`);
    };
    return () => es.close();
  }
}

let plannerConfig: PlannerConfig = {
  mode: (typeof window !== 'undefined' && localStorage.getItem('setuvyuha_planner_mode') === 'live') ? 'live' : 'fixture',
  apiBaseUrl: (typeof window !== 'undefined' && localStorage.getItem('setuvyuha_api_base_url'))
    ? normalizeBaseUrl(localStorage.getItem('setuvyuha_api_base_url')!)
    : 'http://localhost:8000'
};

const fixturePlannerAdapter = new FixturePlannerAdapter();
let livePlannerAdapter = new LiveApiPlannerAdapter(plannerConfig.apiBaseUrl);

export function getPlannerAdapter(): IPlannerAdapter {
  return plannerConfig.mode === 'live' ? livePlannerAdapter : fixturePlannerAdapter;
}

export function getPlannerConfig(): PlannerConfig {
  return { ...plannerConfig };
}

export function setPlannerConfig(config: Partial<PlannerConfig>) {
  plannerConfig = {
    ...plannerConfig,
    ...config,
    apiBaseUrl: config.apiBaseUrl ? normalizeBaseUrl(config.apiBaseUrl) : plannerConfig.apiBaseUrl
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem('setuvyuha_planner_mode', plannerConfig.mode);
    if (plannerConfig.apiBaseUrl) {
      localStorage.setItem('setuvyuha_api_base_url', plannerConfig.apiBaseUrl);
    }
  }
  livePlannerAdapter = new LiveApiPlannerAdapter(plannerConfig.apiBaseUrl);
}

export function resetPlannerFixtures() {
  plannerMemoryStore = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(PLANNER_STORAGE_KEY);
  }
}
