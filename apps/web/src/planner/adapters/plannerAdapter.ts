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

export class LiveApiPlannerAdapter implements IPlannerAdapter {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
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

  listOrders(): Promise<PlannerOrder[]> {
    return this.requestJson('/planner/orders');
  }

  getOrder(orderId: string): Promise<PlannerOrder> {
    return this.requestJson(`/planner/orders/${encodeURIComponent(orderId)}`);
  }

  createPlannerOrder(req: PlannerIntakeRequest): Promise<PlannerOrder> {
    return this.requestJson('/planner/orders', { method: 'POST', body: JSON.stringify(req) });
  }

  selectCandidate(orderId: string, candidateId: string): Promise<PlannerOrder> {
    return this.requestJson(`/planner/orders/${encodeURIComponent(orderId)}/candidate`, {
      method: 'POST',
      body: JSON.stringify({ candidateId })
    });
  }

  previewCutoffImpact(orderId: string, candidateId: string, cutoffTime: string): Promise<CutoffPreviewResult> {
    return this.requestJson(`/planner/orders/${encodeURIComponent(orderId)}/cutoff-preview`, {
      method: 'POST',
      body: JSON.stringify({ candidateId, cutoffTime })
    });
  }

  approveRecovery(orderId: string, candidateId: string, expectedVersion: number, previewResult?: CutoffPreviewResult): Promise<PlannerOrder> {
    return this.requestJson(`/planner/orders/${encodeURIComponent(orderId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ candidateId, expectedVersion, previewId: previewResult?.previewId })
    });
  }

  rejectRecovery(orderId: string, reason: string, expectedVersion: number): Promise<PlannerOrder> {
    return this.requestJson(`/planner/orders/${encodeURIComponent(orderId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason, expectedVersion })
    });
  }

  recordUnavoidableDelay(orderId: string, note: string, expectedVersion: number): Promise<PlannerOrder> {
    return this.requestJson(`/planner/orders/${encodeURIComponent(orderId)}/unavoidable-delay`, {
      method: 'POST',
      body: JSON.stringify({ note, expectedVersion })
    });
  }

  createPurchaseOrder(orderId: string, approverName: string): Promise<PlannerOrder> {
    return this.requestJson(`/planner/orders/${encodeURIComponent(orderId)}/purchasing/po`, {
      method: 'POST',
      body: JSON.stringify({ approverName })
    });
  }

  sendSupplierEmail(orderId: string, approverName: string): Promise<PlannerOrder> {
    return this.requestJson(`/planner/orders/${encodeURIComponent(orderId)}/purchasing/email`, {
      method: 'POST',
      body: JSON.stringify({ approverName })
    });
  }

  subscribeTelemetryStream(
    orderId: string,
    onUpdate: (telemetry: TelemetrySnapshot) => void,
    onError: (message: string) => void
  ): () => void {
    if (typeof EventSource === 'undefined') {
      onError('EventSource unavailable in current environment.');
      return () => {};
    }
    const es = new EventSource(`${this.baseUrl}/planner/orders/${encodeURIComponent(orderId)}/stream`);
    es.onmessage = ev => {
      try {
        const parsed = JSON.parse(ev.data) as TelemetrySnapshot;
        onUpdate(parsed);
      } catch {
        onError('Malformed telemetry stream event.');
      }
    };
    es.onerror = () => {
      onError(`Live P2 telemetry stream disconnected (${this.baseUrl}/planner/orders/${orderId}/stream).`);
    };
    return () => es.close();
  }
}

let plannerConfig: PlannerConfig = {
  mode: (typeof window !== 'undefined' && localStorage.getItem('setuvyuha_planner_mode') === 'live') ? 'live' : 'fixture',
  apiBaseUrl: (typeof window !== 'undefined' && localStorage.getItem('setuvyuha_api_base_url')) || 'http://localhost:8000/api'
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
  plannerConfig = { ...plannerConfig, ...config };
  if (typeof window !== 'undefined') {
    localStorage.setItem('setuvyuha_planner_mode', plannerConfig.mode);
    if (config.apiBaseUrl) {
      localStorage.setItem('setuvyuha_api_base_url', config.apiBaseUrl);
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
