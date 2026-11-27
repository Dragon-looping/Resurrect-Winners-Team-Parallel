import type { 
  CustomerOrder, 
  DeliveryRequest, 
  OfferReplyRequest, 
  AdapterConfig 
} from '../types/order.ts';
import { SEEDED_SCENARIOS } from '../fixtures/scenarios.ts';
import { findCatalogItem } from '../fixtures/catalog.ts';
import { getUnitLabel } from '../utils/formatters.ts';

export interface IOrderAdapter {
  createOrder(request: DeliveryRequest): Promise<CustomerOrder>;
  getOrder(orderId: string): Promise<CustomerOrder>;
  submitClarification(orderId: string, questionId: string, selectedOptionId: string): Promise<CustomerOrder>;
  replyToOffer(orderId: string, reply: OfferReplyRequest): Promise<CustomerOrder>;
  refreshOffer(orderId: string): Promise<CustomerOrder>;
}

const STORAGE_KEY = 'setuvyuha_customer_orders_v1';
let memoryStore: Record<string, CustomerOrder> | null = null;

export class FixtureOrderAdapter implements IOrderAdapter {
  private getStore(): Record<string, CustomerOrder> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      }
    } catch {
      // Fallback if sessionStorage not available
    }
    if (memoryStore) {
      return memoryStore;
    }
    const initial: Record<string, CustomerOrder> = JSON.parse(JSON.stringify(SEEDED_SCENARIOS));
    this.saveStore(initial);
    return initial;
  }

  private saveStore(store: Record<string, CustomerOrder>) {
    memoryStore = store;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      }
    } catch {
      // Ignore storage errors in test runners
    }
  }

  async createOrder(request: DeliveryRequest): Promise<CustomerOrder> {
    await new Promise(r => setTimeout(r, 200));
    const store = this.getStore();

    // Verify SKU against catalog
    const catalogItem = findCatalogItem(request.itemSku);
    if (!catalogItem) {
      throw new Error(`Item SKU "${request.itemSku}" is not recognized in regional logistics catalog. Available SKUs: FAN-HV-24-IND, PMP-SUB-05-AGR`);
    }

    const destUpper = request.destination.toUpperCase();
    const locTag = destUpper.includes('BRAHMAVAR')
      ? 'BRAHMAVAR'
      : destUpper.includes('KUNDAPURA')
      ? 'KUNDAPURA'
      : destUpper.includes('MANIPAL')
      ? 'MANIPAL'
      : destUpper.includes('UDUPI')
      ? 'UDUPI'
      : destUpper.includes('MANGALORE')
      ? 'MANGALORE'
      : (request.destination.trim().split(/[\s,]+/)[0] || 'HUB').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12) || 'HUB';

    const orderId = `ORD-2026-${locTag}-${Math.floor(1000 + Math.random() * 9000)}`;
    const isAmbiguous = request.notes?.toLowerCase().includes('ambiguous');

    const newOrder: CustomerOrder = {
      orderId,
      version: 1,
      status: isAmbiguous ? 'clarifying' : 'offer_issued',
      requestedDetails: {
        ...request,
        itemName: request.itemName || catalogItem.name
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (isAmbiguous) {
      newOrder.clarificationPrompt = {
        questionId: 'Q-DATE-MEANING-01',
        field: 'arrivalDate',
        questionText: 'Fulfilment Timing Verification: How should arrival deadline be scheduled?',
        options: [
          {
            id: 'arrive_by_date',
            label: `Arrive at destination by target date (${request.requestedArrivalDate})`,
            description: 'Shipment delivered to receiving dock before close of business on target date.'
          },
          {
            id: 'dispatch_by_date',
            label: `Leave the warehouse by target date (${request.requestedArrivalDate})`,
            description: 'Shipment dispatched from primary origin on target date, delivering over subsequent window.'
          }
        ]
      };
    } else {
      // Compute coherent split based on SKU and stock allocation
      const totalQty = request.quantity;
      let primaryQty: number;
      let secondaryQty: number;

      if (catalogItem.splitRatio && totalQty === catalogItem.defaultQuantity) {
        primaryQty = catalogItem.splitRatio.primary;
        secondaryQty = catalogItem.splitRatio.secondary;
      } else if (totalQty > 1) {
        primaryQty = Math.max(1, Math.round(totalQty * 0.75));
        secondaryQty = totalQty - primaryQty;
      } else {
        primaryQty = 1;
        secondaryQty = 0;
      }

      const unit = catalogItem.unitLabel;
      const proposedShipments = [
        {
          shipmentId: `SHP-${orderId.slice(-4)}-${primaryQty}A`,
          quantity: primaryQty,
          arrivalDate: request.requestedArrivalDate,
          originWarehouse: catalogItem.standardOrigin,
          destination: request.destination,
          isProposed: true,
          statusText: `Proposed: Ready at ${catalogItem.standardOrigin.split(' ')[0]} dispatch`
        }
      ];

      if (secondaryQty > 0) {
        proposedShipments.push({
          shipmentId: `SHP-${orderId.slice(-4)}-${secondaryQty}B`,
          quantity: secondaryQty,
          arrivalDate: '2026-11-29',
          originWarehouse: catalogItem.bufferOrigin,
          destination: request.destination,
          isProposed: true,
          statusText: 'Proposed: In-transit from regional buffer'
        });
      }

      newOrder.activeOffer = {
        offerId: `OFF-${catalogItem.standardOrigin.slice(0, 4).toUpperCase()}-${orderId.slice(-4)}`,
        version: 1,
        orderId,
        offerType: secondaryQty > 0 ? 'split' : 'standard',
        proposedShipments,
        expiresAt: new Date(Date.now() + 1800000).toISOString(),
        permittedActions: ['accept_split', 'accept_later', 'insist_original', 'decline'],
        notes: secondaryQty > 0
          ? `Warehouse physical count reconciliation identified ${primaryQty} ${unit} available immediately at ${catalogItem.standardOrigin}. Remaining ${secondaryQty} ${unit} sourced from ${catalogItem.bufferOrigin}.`
          : `Full requested allocation of ${primaryQty} ${unit} confirmed ready at ${catalogItem.standardOrigin}.`
      };
    }

    store[orderId] = newOrder;
    this.saveStore(store);
    return newOrder;
  }

  async getOrder(orderId: string): Promise<CustomerOrder> {
    await new Promise(r => setTimeout(r, 100));
    const store = this.getStore();
    const order = store[orderId];
    if (!order) {
      if (SEEDED_SCENARIOS[orderId]) {
        return JSON.parse(JSON.stringify(SEEDED_SCENARIOS[orderId]));
      }
      throw new Error(`Order not found: ${orderId}`);
    }
    return order;
  }

  async submitClarification(orderId: string, _questionId: string, selectedOptionId: string): Promise<CustomerOrder> {
    await new Promise(r => setTimeout(r, 200));
    const store = this.getStore();
    const order = store[orderId] || SEEDED_SCENARIOS[orderId];
    if (!order) throw new Error(`Order not found: ${orderId}`);

    order.status = 'offer_issued';
    order.clarificationPrompt = undefined;
    order.version += 1;
    order.updatedAt = new Date().toISOString();

    const arrivalDate = selectedOptionId.includes('dispatch')
      ? '2026-11-29'
      : order.requestedDetails.requestedArrivalDate;

    const catalogItem = findCatalogItem(order.requestedDetails.itemSku);
    const standardOrigin = catalogItem?.standardOrigin || 'Udupi Regional Hub';
    const bufferOrigin = catalogItem?.bufferOrigin || 'Mangalore Buffer Depot';
    const totalQty = order.requestedDetails.quantity;
    const primaryQty = catalogItem?.splitRatio && totalQty === catalogItem.defaultQuantity
      ? catalogItem.splitRatio.primary
      : Math.max(1, Math.round(totalQty * 0.75));
    const secondaryQty = totalQty - primaryQty;

    order.activeOffer = {
      offerId: `OFF-RESOLVE-${orderId.slice(-4)}`,
      version: order.version,
      orderId,
      offerType: 'split',
      proposedShipments: [
        {
          shipmentId: `SHP-${orderId.slice(-4)}-${primaryQty}A`,
          quantity: primaryQty,
          arrivalDate,
          originWarehouse: standardOrigin,
          destination: order.requestedDetails.destination,
          isProposed: true,
          statusText: 'Proposed: Confirmed dock schedule'
        },
        {
          shipmentId: `SHP-${orderId.slice(-4)}-${secondaryQty}B`,
          quantity: secondaryQty,
          arrivalDate: '2026-11-29',
          originWarehouse: bufferOrigin,
          destination: order.requestedDetails.destination,
          isProposed: true,
          statusText: 'Proposed: Buffer transfer'
        }
      ],
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
      permittedActions: ['accept_split', 'accept_later', 'insist_original', 'decline'],
      notes: `Clarified arrival criteria: ${selectedOptionId.includes('dispatch') ? 'Dispatch Friday (deliver Sunday)' : 'Deliver dockside Friday'}.`
    };

    store[orderId] = order;
    this.saveStore(store);
    return order;
  }

  async replyToOffer(orderId: string, reply: OfferReplyRequest): Promise<CustomerOrder> {
    await new Promise(r => setTimeout(r, 250));
    const store = this.getStore();
    const order = store[orderId] || SEEDED_SCENARIOS[orderId];
    if (!order) throw new Error(`Order not found: ${orderId}`);

    if (order.activeOffer && order.activeOffer.version !== reply.offerVersion) {
      throw new Error(`Offer version conflict: received version ${reply.offerVersion}, expected ${order.activeOffer.version}`);
    }

    order.lastCustomerDecision = reply.decision;
    order.version += 1;
    order.updatedAt = new Date().toISOString();

    const unit = getUnitLabel(order.requestedDetails.itemSku, order.requestedDetails.itemName);
    const catalogItem = findCatalogItem(order.requestedDetails.itemSku);

    if (reply.decision === 'accept_split') {
      order.status = 'confirmed';
      const shipments = order.activeOffer?.proposedShipments || [];
      order.confirmedShipments = shipments.map((shp, i) => ({
        ...shp,
        shipmentId: `SHP-CNF-${shp.quantity}-${String.fromCharCode(65 + i)}`,
        carrierTrackingRef: `STV-TRK-${Math.floor(1000 + Math.random() * 9000)}`,
        isProposed: false,
        statusText: i === 0 ? 'Confirmed: Staged for loading' : 'Confirmed: Buffer transit booked'
      }));
      order.activeOffer = undefined;
    } else if (reply.decision === 'accept_later') {
      order.status = 'confirmed';
      const origin = catalogItem?.standardOrigin || 'Udupi Consolidated Consolidation';
      order.confirmedShipments = [
        {
          shipmentId: `SHP-CNF-${order.requestedDetails.quantity}-L`,
          quantity: order.requestedDetails.quantity,
          arrivalDate: '2026-12-01',
          originWarehouse: origin,
          destination: order.requestedDetails.destination,
          carrierTrackingRef: `STV-TRK-${Math.floor(1000 + Math.random() * 9000)}`,
          isProposed: false,
          statusText: 'Confirmed: Single consolidated consignment'
        }
      ];
      order.activeOffer = undefined;
    } else if (reply.decision === 'insist_original') {
      order.status = 'recovery_pending';
      order.customerDelayReason = `Customer confirmed requirement: all ${order.requestedDetails.quantity} ${unit} together by ${order.requestedDetails.requestedArrivalDate}. Dispatch engine is scanning inter-hub express transfers.`;
      order.activeOffer = undefined;
    } else if (reply.decision === 'decline') {
      order.status = 'offer_issued';
      const origin = catalogItem?.standardOrigin || 'Regional Consolidated Hub';
      order.activeOffer = {
        offerId: `OFF-LATER-${orderId.slice(-4)}`,
        version: order.version,
        orderId,
        offerType: 'later',
        proposedShipments: [
          {
            shipmentId: `SHP-PROP-${order.requestedDetails.quantity}L`,
            quantity: order.requestedDetails.quantity,
            arrivalDate: '2026-12-01',
            originWarehouse: origin,
            destination: order.requestedDetails.destination,
            isProposed: true,
            statusText: 'Proposed: Single consignment following buffer replenishment'
          }
        ],
        expiresAt: new Date(Date.now() + 1800000).toISOString(),
        permittedActions: ['accept_later', 'insist_original', 'decline'],
        notes: `Split offer was declined. Single later delivery of ${order.requestedDetails.quantity} ${unit} is offered for Tuesday, Dec 01.`
      };
    }

    store[orderId] = order;
    this.saveStore(store);
    return order;
  }

  async refreshOffer(orderId: string): Promise<CustomerOrder> {
    await new Promise(r => setTimeout(r, 200));
    const store = this.getStore();
    const order = store[orderId] || SEEDED_SCENARIOS[orderId];
    if (!order) throw new Error(`Order not found: ${orderId}`);

    const catalogItem = findCatalogItem(order.requestedDetails.itemSku);
    const totalQty = order.requestedDetails.quantity;
    let primaryQty: number;
    let secondaryQty: number;

    if (catalogItem?.splitRatio && totalQty === catalogItem.defaultQuantity) {
      primaryQty = catalogItem.splitRatio.primary;
      secondaryQty = catalogItem.splitRatio.secondary;
    } else if (totalQty > 1) {
      primaryQty = Math.max(1, Math.round(totalQty * 0.75));
      secondaryQty = totalQty - primaryQty;
    } else {
      primaryQty = 1;
      secondaryQty = 0;
    }

    const standardOrigin = catalogItem?.standardOrigin || 'Udupi Regional Hub';
    const bufferOrigin = catalogItem?.bufferOrigin || 'Mangalore Buffer Depot';
    const unit = getUnitLabel(order.requestedDetails.itemSku, order.requestedDetails.itemName);

    order.status = 'offer_issued';
    order.version += 1;
    order.updatedAt = new Date().toISOString();

    const proposedShipments = [
      {
        shipmentId: `SHP-REN-${primaryQty}A`,
        quantity: primaryQty,
        arrivalDate: order.requestedDetails.requestedArrivalDate,
        originWarehouse: standardOrigin,
        destination: order.requestedDetails.destination,
        isProposed: true,
        statusText: `Refreshed Proposal: ${primaryQty} ${unit} reserved`
      }
    ];

    if (secondaryQty > 0) {
      proposedShipments.push({
        shipmentId: `SHP-REN-${secondaryQty}B`,
        quantity: secondaryQty,
        arrivalDate: '2026-11-29',
        originWarehouse: bufferOrigin,
        destination: order.requestedDetails.destination,
        isProposed: true,
        statusText: `Refreshed Proposal: ${secondaryQty} ${unit} reserved`
      });
    }

    order.activeOffer = {
      offerId: `OFF-RENEW-${orderId.slice(-4)}`,
      version: order.version,
      orderId,
      offerType: secondaryQty > 0 ? 'split' : 'standard',
      proposedShipments,
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
      permittedActions: ['accept_split', 'accept_later', 'insist_original', 'decline'],
      notes: 'Offer successfully renewed from live warehouse allocation.'
    };

    store[orderId] = order;
    this.saveStore(store);
    return order;
  }
}

export class LiveApiOrderAdapter implements IOrderAdapter {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async createOrder(request: DeliveryRequest): Promise<CustomerOrder> {
    const res = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Live API POST /orders failed (${res.status}): ${errBody || res.statusText}`);
    }
    return res.json();
  }

  async getOrder(orderId: string): Promise<CustomerOrder> {
    const res = await fetch(`${this.baseUrl}/orders/${encodeURIComponent(orderId)}`);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Live API GET /orders/${orderId} failed (${res.status}): ${errBody || res.statusText}`);
    }
    return res.json();
  }

  async submitClarification(orderId: string, questionId: string, selectedOptionId: string): Promise<CustomerOrder> {
    const res = await fetch(`${this.baseUrl}/clarify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, questionId, selectedOptionId })
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Live API POST /clarify failed (${res.status}): ${errBody || res.statusText}`);
    }
    return res.json();
  }

  async replyToOffer(_orderId: string, reply: OfferReplyRequest): Promise<CustomerOrder> {
    const res = await fetch(`${this.baseUrl}/offers/${encodeURIComponent(reply.offerId)}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reply)
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Live API POST /offers/${reply.offerId}/reply failed (${res.status}): ${errBody || res.statusText}`);
    }
    return res.json();
  }

  async refreshOffer(orderId: string): Promise<CustomerOrder> {
    const res = await fetch(`${this.baseUrl}/orders/${encodeURIComponent(orderId)}/refresh-offer`, {
      method: 'POST'
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Live API POST /orders/${orderId}/refresh-offer failed (${res.status}): ${errBody || res.statusText}`);
    }
    return res.json();
  }
}

// Singleton adapter manager
let currentConfig: AdapterConfig = {
  mode: (typeof window !== 'undefined' && localStorage.getItem('setuvyuha_api_mode') === 'live') ? 'live' : 'fixture',
  apiBaseUrl: (typeof window !== 'undefined' && localStorage.getItem('setuvyuha_api_base_url')) || 'http://localhost:8000/api'
};

const fixtureAdapter = new FixtureOrderAdapter();
let liveAdapter = new LiveApiOrderAdapter(currentConfig.apiBaseUrl);

export function getOrderAdapter(): IOrderAdapter {
  return currentConfig.mode === 'live' ? liveAdapter : fixtureAdapter;
}

export function getAdapterConfig(): AdapterConfig {
  return { ...currentConfig };
}

export function setAdapterConfig(config: Partial<AdapterConfig>) {
  currentConfig = { ...currentConfig, ...config };
  if (typeof window !== 'undefined') {
    localStorage.setItem('setuvyuha_api_mode', currentConfig.mode);
    if (config.apiBaseUrl) {
      localStorage.setItem('setuvyuha_api_base_url', config.apiBaseUrl);
    }
  }
  liveAdapter = new LiveApiOrderAdapter(currentConfig.apiBaseUrl);
}

export function resetFixtureData() {
  memoryStore = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
