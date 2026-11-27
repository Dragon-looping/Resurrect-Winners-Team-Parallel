import type { 
  CustomerOrder, 
  DeliveryRequest, 
  OfferReplyRequest, 
  AdapterConfig 
} from '../types/order.ts';
import { SEEDED_SCENARIOS } from '../fixtures/scenarios.ts';

export interface IOrderAdapter {
  createOrder(request: DeliveryRequest): Promise<CustomerOrder>;
  getOrder(orderId: string): Promise<CustomerOrder>;
  submitClarification(orderId: string, questionId: string, selectedOptionId: string): Promise<CustomerOrder>;
  replyToOffer(orderId: string, reply: OfferReplyRequest): Promise<CustomerOrder>;
  refreshOffer(orderId: string): Promise<CustomerOrder>;
}

const STORAGE_KEY = 'setuvyuha_customer_orders_v1';

export class FixtureOrderAdapter implements IOrderAdapter {
  private getStore(): Record<string, CustomerOrder> {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Fallback if sessionStorage not available
    }
    // Deep clone seeded scenarios
    const initial: Record<string, CustomerOrder> = JSON.parse(JSON.stringify(SEEDED_SCENARIOS));
    this.saveStore(initial);
    return initial;
  }

  private saveStore(store: Record<string, CustomerOrder>) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Ignore storage errors in test runners
    }
  }

  async createOrder(request: DeliveryRequest): Promise<CustomerOrder> {
    await new Promise(r => setTimeout(r, 200)); // simulate brief network roundtrip
    const store = this.getStore();
    const orderId = `ORD-2026-MANIPAL-${Math.floor(1000 + Math.random() * 9000)}`;

    // If ambiguous phrasing without arrival vs dispatch specification, can prompt clarify
    const isAmbiguous = request.notes?.toLowerCase().includes('ambiguous');

    const newOrder: CustomerOrder = {
      orderId,
      version: 1,
      status: isAmbiguous ? 'clarifying' : 'offer_issued',
      requestedDetails: { ...request },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (isAmbiguous) {
      newOrder.clarificationPrompt = {
        questionId: 'Q-DATE-MEANING-01',
        field: 'arrivalDate',
        questionText: 'Fulfilment Timing Verification: How should "Friday" be scheduled?',
        options: [
          {
            id: 'arrive_by_friday',
            label: 'Arrive at destination by Friday',
            description: 'Shipment delivered to shop dock before close of business Friday.'
          },
          {
            id: 'dispatch_by_friday',
            label: 'Leave the warehouse by Friday',
            description: 'Shipment dispatched from Udupi Friday, delivering over the weekend.'
          }
        ]
      };
    } else {
      // Warehouse physical count 40 / 50 -> offer split
      newOrder.activeOffer = {
        offerId: `OFF-UDUPI-${orderId.slice(-4)}`,
        version: 1,
        orderId,
        offerType: 'split',
        proposedShipments: [
          {
            shipmentId: `SHP-${orderId.slice(-4)}-40A`,
            quantity: 40,
            arrivalDate: request.requestedArrivalDate,
            originWarehouse: 'Udupi Regional Hub',
            destination: request.destination,
            isProposed: true,
            statusText: 'Proposed: Ready at Udupi dispatch'
          },
          {
            shipmentId: `SHP-${orderId.slice(-4)}-10B`,
            quantity: 10,
            arrivalDate: '2026-11-29', // Sunday
            originWarehouse: 'Mangalore Buffer Depot via Udupi',
            destination: request.destination,
            isProposed: true,
            statusText: 'Proposed: In-transit from regional buffer'
          }
        ],
        expiresAt: new Date(Date.now() + 1800000).toISOString(),
        permittedActions: ['accept_split', 'accept_later', 'insist_original', 'decline'],
        notes: 'Warehouse physical count reconciliation identified 40 units available immediately at Udupi. Remaining 10 units sourced from regional buffer.'
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
      // Check seeded scenarios directly
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

    // Update clarification
    order.status = 'offer_issued';
    order.clarificationPrompt = undefined;
    order.version += 1;
    order.updatedAt = new Date().toISOString();

    const arrivalDate = selectedOptionId === 'dispatch_by_friday' ? '2026-11-29' : order.requestedDetails.requestedArrivalDate;

    order.activeOffer = {
      offerId: `OFF-UDUPI-${orderId.slice(-4)}`,
      version: order.version,
      orderId,
      offerType: 'split',
      proposedShipments: [
        {
          shipmentId: `SHP-${orderId.slice(-4)}-40A`,
          quantity: 40,
          arrivalDate,
          originWarehouse: 'Udupi Regional Hub',
          destination: order.requestedDetails.destination,
          isProposed: true,
          statusText: 'Proposed: Confirmed dock schedule'
        },
        {
          shipmentId: `SHP-${orderId.slice(-4)}-10B`,
          quantity: 10,
          arrivalDate: '2026-11-29',
          originWarehouse: 'Mangalore Buffer Depot',
          destination: order.requestedDetails.destination,
          isProposed: true,
          statusText: 'Proposed: Buffer transfer'
        }
      ],
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
      permittedActions: ['accept_split', 'accept_later', 'insist_original', 'decline'],
      notes: `Clarified arrival criteria: ${selectedOptionId === 'dispatch_by_friday' ? 'Dispatch Friday (deliver Sunday)' : 'Deliver dockside Friday'}.`
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

    // Verify version check
    if (order.activeOffer && order.activeOffer.version !== reply.offerVersion) {
      throw new Error(`Offer version conflict: received version ${reply.offerVersion}, expected ${order.activeOffer.version}`);
    }

    order.lastCustomerDecision = reply.decision;
    order.version += 1;
    order.updatedAt = new Date().toISOString();

    if (reply.decision === 'accept_split') {
      order.status = 'confirmed';
      order.confirmedShipments = [
        {
          shipmentId: `SHP-CNF-40A`,
          quantity: 40,
          arrivalDate: order.requestedDetails.requestedArrivalDate,
          originWarehouse: 'Udupi Central Warehouse',
          destination: order.requestedDetails.destination,
          carrierTrackingRef: `STV-UD-4081`,
          isProposed: false,
          statusText: 'Confirmed: Staged for loading'
        },
        {
          shipmentId: `SHP-CNF-10B`,
          quantity: 10,
          arrivalDate: '2026-11-29',
          originWarehouse: 'Mangalore Buffer Depot',
          destination: order.requestedDetails.destination,
          carrierTrackingRef: `STV-UD-4082`,
          isProposed: false,
          statusText: 'Confirmed: Buffer transit booked'
        }
      ];
      order.activeOffer = undefined;
    } else if (reply.decision === 'accept_later') {
      order.status = 'confirmed';
      order.confirmedShipments = [
        {
          shipmentId: `SHP-CNF-50L`,
          quantity: 50,
          arrivalDate: '2026-12-01',
          originWarehouse: 'Udupi Consolidated Consolidation',
          destination: order.requestedDetails.destination,
          carrierTrackingRef: `STV-UD-4099`,
          isProposed: false,
          statusText: 'Confirmed: Single shipment consolidated'
        }
      ];
      order.activeOffer = undefined;
    } else if (reply.decision === 'insist_original') {
      order.status = 'recovery_pending';
      order.customerDelayReason = 'Customer confirmed requirement: all 50 units together by Friday, Nov 27. Dispatch engine is scanning inter-hub express transfers.';
      order.activeOffer = undefined;
    } else if (reply.decision === 'decline') {
      // Revert to draft or later alternative
      order.status = 'offer_issued';
      order.activeOffer = {
        offerId: `OFF-UDUPI-LATER-${orderId.slice(-4)}`,
        version: order.version,
        orderId,
        offerType: 'later',
        proposedShipments: [
          {
            shipmentId: `SHP-PROP-50L`,
            quantity: 50,
            arrivalDate: '2026-12-01',
            originWarehouse: 'Udupi Consolidated Consolidation',
            destination: order.requestedDetails.destination,
            isProposed: true,
            statusText: 'Proposed: Single consignment following buffer replenishment'
          }
        ],
        expiresAt: new Date(Date.now() + 1800000).toISOString(),
        permittedActions: ['accept_later', 'insist_original', 'decline'],
        notes: 'Split offer was declined. Single later delivery is offered for Tuesday, Dec 01.'
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

    order.status = 'offer_issued';
    order.version += 1;
    order.updatedAt = new Date().toISOString();
    order.activeOffer = {
      offerId: `OFF-UDUPI-RENEW-${orderId.slice(-4)}`,
      version: order.version,
      orderId,
      offerType: 'split',
      proposedShipments: [
        {
          shipmentId: `SHP-REN-40A`,
          quantity: 40,
          arrivalDate: order.requestedDetails.requestedArrivalDate,
          originWarehouse: 'Udupi Regional Hub',
          destination: order.requestedDetails.destination,
          isProposed: true,
          statusText: 'Refreshed Proposal: 40 units reserved'
        },
        {
          shipmentId: `SHP-REN-10B`,
          quantity: 10,
          arrivalDate: '2026-11-29',
          originWarehouse: 'Mangalore Buffer Depot',
          destination: order.requestedDetails.destination,
          isProposed: true,
          statusText: 'Refreshed Proposal: 10 units reserved'
        }
      ],
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
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
