import type { 
  CustomerOrder, 
  DeliveryRequest, 
  OfferReplyRequest, 
  AdapterConfig,
  OrderStatus,
  OfferProposal,
  ShipmentItem
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
      const totalQty = order.requestedDetails.quantity;
      const stagedQty = Math.max(1, Math.round(totalQty * 0.75));
      const shortfallQty = totalQty - stagedQty;
      const reqDate = order.requestedDetails.requestedArrivalDate;
      const laterDate = new Date(new Date(reqDate).getTime() + 2 * 86400000).toISOString().split('T')[0];

      let shipments = order.activeOffer?.proposedShipments || [];
      if (shipments.length === 0) {
        shipments = [
          {
            shipmentId: `SHP-PROP-${stagedQty}A`,
            quantity: stagedQty,
            arrivalDate: reqDate,
            originWarehouse: catalogItem?.standardOrigin || 'Udupi Regional Hub',
            destination: order.requestedDetails.destination,
            isProposed: true,
            statusText: 'Proposed: Confirmed dock schedule'
          },
          ...(shortfallQty > 0 ? [{
            shipmentId: `SHP-PROP-${shortfallQty}B`,
            quantity: shortfallQty,
            arrivalDate: laterDate,
            originWarehouse: catalogItem?.bufferOrigin || 'Mangalore Buffer Depot',
            destination: order.requestedDetails.destination,
            isProposed: true,
            statusText: 'Proposed: Regional buffer transfer'
          }] : [])
        ];
      }

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
      const reqDate = order.requestedDetails.requestedArrivalDate;
      const laterDate = new Date(new Date(reqDate).getTime() + 4 * 86400000).toISOString().split('T')[0];
      order.confirmedShipments = [
        {
          shipmentId: `SHP-CNF-${order.requestedDetails.quantity}-L`,
          quantity: order.requestedDetails.quantity,
          arrivalDate: laterDate,
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
      const totalQty = order.requestedDetails.quantity;
      const primaryQty = catalogItem?.splitRatio && totalQty === catalogItem.defaultQuantity
        ? catalogItem.splitRatio.primary
        : Math.max(1, Math.round(totalQty * 0.75));
      const secondaryQty = totalQty - primaryQty;
      const reqDate = order.requestedDetails.requestedArrivalDate;
      const laterDate = new Date(new Date(reqDate).getTime() + 4 * 86400000).toISOString().split('T')[0];
      const splitLaterDate = new Date(new Date(reqDate).getTime() + 2 * 86400000).toISOString().split('T')[0];

      order.availableOffers = {
        split: {
          offerId: `OFF-SPLIT-${orderId.slice(-4)}`,
          version: order.version,
          orderId,
          offerType: 'split',
          proposedShipments: [
            {
              shipmentId: `SHP-${orderId.slice(-4)}-${primaryQty}A`,
              quantity: primaryQty,
              arrivalDate: reqDate,
              originWarehouse: catalogItem?.standardOrigin || 'Udupi Regional Hub',
              destination: order.requestedDetails.destination,
              isProposed: true,
              statusText: 'Proposed: Ready at dispatch'
            },
            ...(secondaryQty > 0 ? [{
              shipmentId: `SHP-${orderId.slice(-4)}-${secondaryQty}B`,
              quantity: secondaryQty,
              arrivalDate: splitLaterDate,
              originWarehouse: catalogItem?.bufferOrigin || 'Mangalore Buffer Depot',
              destination: order.requestedDetails.destination,
              isProposed: true,
              statusText: 'Proposed: In-transit from regional buffer'
            }] : [])
          ],
          expiresAt: new Date(Date.now() + 1800000).toISOString(),
          permittedActions: ['accept_split', 'accept_later', 'insist_original', 'decline']
        },
        later: {
          offerId: `OFF-LATER-${orderId.slice(-4)}`,
          version: order.version,
          orderId,
          offerType: 'later',
          proposedShipments: [
            {
              shipmentId: `SHP-${orderId.slice(-4)}-${totalQty}L`,
              quantity: totalQty,
              arrivalDate: laterDate,
              originWarehouse: catalogItem?.standardOrigin || 'Udupi Regional Hub',
              destination: order.requestedDetails.destination,
              isProposed: true,
              statusText: 'Proposed: Single consolidated consignment'
            }
          ],
          expiresAt: new Date(Date.now() + 1800000).toISOString(),
          permittedActions: ['accept_later', 'insist_original', 'decline']
        }
      };
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

function transformApiOrderToCustomerOrder(
  apiOrder: any,
  offers: any[] = []
): CustomerOrder {
  // Map SKU ID to known SKU identifier and item name
  let itemSku = 'FAN-EL-001';
  let itemName = 'Electric fans';
  if (apiOrder.sku_id === 2) {
    itemSku = 'MTR-IND-001';
    itemName = 'Motors';
  } else if (apiOrder.sku_id === 3) {
    itemSku = 'CWR-001';
    itemName = 'Copper wire';
  }

  // Map Plant ID to hub name
  let plantName = 'Manipal Retail Hub';
  if (apiOrder.plant_id === 1) {
    plantName = 'Mangaluru Regional Depot';
  } else if (apiOrder.plant_id === 2) {
    plantName = 'Udupi Regional Hub';
  } else if (apiOrder.plant_id === 3) {
    plantName = 'Manipal Retail Hub';
  }

  // Map FastAPI OrderStatus to frontend OrderStatus
  let status: OrderStatus = 'offer_issued';
  if (apiOrder.status === 'CONFIRMED') {
    status = 'confirmed';
  } else if (apiOrder.status === 'BACKLOGGED') {
    status = 'recovery_pending';
  } else if (apiOrder.status === 'CREATED' || apiOrder.status === 'OFFER_SENT') {
    status = 'offer_issued';
  } else if (apiOrder.status === 'CANCELLED') {
    status = 'expired';
  }

  const totalQty = apiOrder.quantity;
  const reqDate = (apiOrder.customer_request_date || '').split('T')[0] || '2026-11-27';

  // Extract backend-issued offers for split and later options
  const backendSplitOfferRaw = offers.slice().reverse().find((o: any) => o.offer_details?.offer_type === 'split');
  const backendLaterOfferRaw = offers.slice().reverse().find((o: any) => o.offer_details?.offer_type === 'later');

  let availableSplitOffer: OfferProposal | undefined = undefined;
  if (backendSplitOfferRaw) {
    const details = backendSplitOfferRaw.offer_details || {};
    const proposedShipments: ShipmentItem[] = (details.proposed_shipments || []).map((s: any, idx: number) => ({
      shipmentId: s.shipmentId || `SHP-${apiOrder.id}-${String.fromCharCode(65 + idx)}`,
      quantity: Number(s.quantity),
      arrivalDate: s.arrivalDate || (backendSplitOfferRaw.proposed_delivery_date || '').split('T')[0] || reqDate,
      originWarehouse: s.originWarehouse || 'Udupi Regional Hub',
      destination: s.destination || apiOrder.customer_name || plantName,
      isProposed: true,
      statusText: s.statusText || (idx === 0 ? 'Proposed: Ready at Udupi dispatch' : 'Proposed: In-transit from regional buffer')
    }));

    availableSplitOffer = {
      offerId: String(backendSplitOfferRaw.id),
      version: 1,
      orderId: String(apiOrder.id),
      offerType: 'split',
      proposedShipments,
      expiresAt: new Date(new Date(backendSplitOfferRaw.created_at).getTime() + 1800000).toISOString(),
      permittedActions: ['accept_split', 'accept_later', 'insist_original', 'decline'],
      notes: details.notes || `Backend split schedule: ${proposedShipments.map(s => `${s.quantity} units arriving ${s.arrivalDate}`).join(' + ')}`
    };
  }

  let availableLaterOffer: OfferProposal | undefined = undefined;
  if (backendLaterOfferRaw) {
    const details = backendLaterOfferRaw.offer_details || {};
    const laterShipDate = (backendLaterOfferRaw.proposed_delivery_date || '').split('T')[0] || reqDate;
    const proposedShipments: ShipmentItem[] = (details.proposed_shipments || []).length > 0
      ? details.proposed_shipments.map((s: any) => ({
          shipmentId: s.shipmentId || `SHP-${apiOrder.id}-L`,
          quantity: Number(s.quantity) || totalQty,
          arrivalDate: s.arrivalDate || laterShipDate,
          originWarehouse: s.originWarehouse || 'Udupi Regional Hub',
          destination: s.destination || apiOrder.customer_name || plantName,
          isProposed: true,
          statusText: s.statusText || 'Proposed: Single consolidated consignment'
        }))
      : [{
          shipmentId: `SHP-${apiOrder.id}-L`,
          quantity: backendLaterOfferRaw.offered_quantity || totalQty,
          arrivalDate: laterShipDate,
          originWarehouse: 'Udupi Regional Hub',
          destination: apiOrder.customer_name || plantName,
          isProposed: true,
          statusText: 'Proposed: Single consolidated consignment'
        }];

    availableLaterOffer = {
      offerId: String(backendLaterOfferRaw.id),
      version: 1,
      orderId: String(apiOrder.id),
      offerType: 'later',
      proposedShipments,
      expiresAt: new Date(new Date(backendLaterOfferRaw.created_at).getTime() + 1800000).toISOString(),
      permittedActions: ['accept_later', 'insist_original', 'decline'],
      notes: details.notes || `Backend later delivery: all ${totalQty} units arriving ${laterShipDate}`
    };
  }

  // Active pending delivery offer (only if order is actively offering, not recovery_pending)
  const pendingOffer = offers.slice().reverse().find((o: any) => o.status === 'PENDING');
  let activeOffer: OfferProposal | undefined = undefined;

  if (status === 'offer_issued') {
    // When stock requires a split, default primary presentation is the split schedule
    if (availableSplitOffer) {
      activeOffer = availableSplitOffer;
    } else if (availableLaterOffer) {
      activeOffer = availableLaterOffer;
    } else if (pendingOffer) {
      const details = pendingOffer.offer_details || {};
      const offerType = details.offer_type || 'split';
      const proposedShipments: ShipmentItem[] = details.proposed_shipments || [];
      activeOffer = {
        offerId: String(pendingOffer.id),
        version: 1,
        orderId: String(apiOrder.id),
        offerType,
        proposedShipments,
        expiresAt: new Date(new Date(pendingOffer.created_at).getTime() + 1800000).toISOString(),
        permittedActions: ['accept_split', 'accept_later', 'insist_original', 'decline'],
        notes: details.notes
      };
    }
  }

  // Look for accepted offer to populate confirmed shipments
  let confirmedShipments: ShipmentItem[] | undefined = undefined;
  if (status === 'confirmed') {
    const acceptedOffer = offers.slice().reverse().find((o: any) => o.status === 'ACCEPTED');
    if (acceptedOffer?.offer_details?.proposed_shipments && acceptedOffer.offer_details.proposed_shipments.length > 0) {
      confirmedShipments = acceptedOffer.offer_details.proposed_shipments.map((s: any, i: number) => ({
        shipmentId: s.shipmentId || `SHP-CNF-${apiOrder.id}-${String.fromCharCode(65 + i)}`,
        quantity: Number(s.quantity),
        arrivalDate: s.arrivalDate || reqDate,
        originWarehouse: s.originWarehouse || 'Udupi Regional Hub',
        destination: s.destination || apiOrder.customer_name || plantName,
        carrierTrackingRef: `STV-TRK-${apiOrder.id}${100 + i}`,
        isProposed: false,
        statusText: i === 0 ? 'Confirmed: Staged for loading' : 'Confirmed: Buffer transit booked'
      }));
    } else {
      const agreedDate = (apiOrder.agreed_delivery_date || apiOrder.customer_request_date || '').split('T')[0] || reqDate;
      confirmedShipments = [
        {
          shipmentId: `SHP-CNF-${apiOrder.id}-L`,
          quantity: totalQty,
          arrivalDate: agreedDate,
          originWarehouse: 'Udupi Regional Hub',
          destination: apiOrder.customer_name || plantName,
          carrierTrackingRef: `STV-TRK-${apiOrder.id}001`,
          isProposed: false,
          statusText: 'Confirmed: Delivery schedule locked'
        }
      ];
    }
  }

  return {
    orderId: String(apiOrder.id),
    version: apiOrder.version || 1,
    status,
    requestedDetails: {
      itemSku,
      itemName,
      quantity: apiOrder.quantity,
      destination: apiOrder.customer_name || plantName,
      requestedArrivalDate: reqDate,
      mustArriveTogether: false,
      notes: apiOrder.order_number
    },
    activeOffer,
    availableOffers: {
      split: availableSplitOffer,
      later: availableLaterOffer
    },
    confirmedShipments,
    customerDelayReason: status === 'recovery_pending'
      ? `Customer confirmed requirement: all ${totalQty} units together by ${reqDate}. Dispatch engine is scanning inter-hub express transfers.`
      : undefined,
    createdAt: apiOrder.created_at,
    updatedAt: apiOrder.updated_at
  };
}

export class LiveApiOrderAdapter implements IOrderAdapter {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private getRootUrl(): string {
    // Strip trailing /api for customer orders and offers routes
    return this.baseUrl.replace(/\/api\/?$/, '');
  }

  async createOrder(request: DeliveryRequest): Promise<CustomerOrder> {
    const rootUrl = this.getRootUrl();

    // Validate SKU against known live backend SKUs
    const skuUpper = (request.itemSku || '').toUpperCase();
    const itemNameUpper = (request.itemName || '').toUpperCase();

    // Explicit rejection for pump SKU (PMP-SUB-05-AGR) in live backend
    if (skuUpper.includes('PMP') || skuUpper.includes('PUMP') || itemNameUpper.includes('PUMP')) {
      throw new Error(`Live API does not support pump SKU "${request.itemSku}" (unsupported in live catalog; pending P2 backend ingestion). Supported regional SKUs: FAN-EL-001 (Electric fans), MTR-IND-001 (Motors), CWR-001 (Copper wire).`);
    }

    let sku_id: number;
    if (skuUpper === 'FAN-HV-24-IND' || skuUpper === 'FAN-EL-001' || skuUpper.includes('FAN')) {
      sku_id = 1; // FAN-EL-001
    } else if (skuUpper === 'MTR-IND-001' || skuUpper.includes('MTR') || skuUpper.includes('MOTOR')) {
      sku_id = 2; // MTR-IND-001
    } else if (skuUpper === 'CWR-001' || skuUpper.includes('CWR') || skuUpper.includes('WIRE')) {
      sku_id = 3; // CWR-001
    } else {
      throw new Error(`Unsupported item SKU "${request.itemSku}". Supported live SKUs: FAN-EL-001 (Electric fans), MTR-IND-001 (Motors), CWR-001 (Copper wire).`);
    }

    // Validate destination against regional service corridor
    const destUpper = (request.destination || '').toUpperCase();
    let plant_id: number;
    let locTag: string;

    if (destUpper.includes('MANIPAL')) {
      plant_id = 3;
      locTag = 'MNP';
    } else if (destUpper.includes('MANGALORE') || destUpper.includes('MANGALURU')) {
      plant_id = 1;
      locTag = 'MNG';
    } else if (destUpper.includes('UDUPI')) {
      plant_id = 2;
      locTag = 'UDP';
    } else if (destUpper.includes('KUNDAPURA')) {
      plant_id = 2; // Kundapura is served by Udupi Regional Hub (Plant 2)
      locTag = 'KND';
    } else if (destUpper.includes('BRAHMAVAR')) {
      plant_id = 2; // Brahmavar is served by Udupi Regional Hub (Plant 2)
      locTag = 'BRH';
    } else {
      throw new Error(`Destination "${request.destination}" is outside the SETUVYUHA regional logistics network. Serviceable regional destinations: Manipal, Udupi, Kundapura, Brahmavar, and Mangaluru.`);
    }

    const order_number = `ORD-2026-${locTag}-${Math.floor(1000 + Math.random() * 9000)}`;
    const customer_name = request.destination.split(',')[0].trim() || 'Direct Customer';
    const quantity = Number(request.quantity);
    const dateOnly = (request.requestedArrivalDate || '').split('T')[0] || '2026-11-27';
    const requested_delivery_date = `${dateOnly}T15:30:00+05:30`;

    const res = await fetch(`${rootUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_number,
        customer_name,
        plant_id,
        sku_id,
        quantity,
        requested_delivery_date
      })
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Live API POST /orders failed (${res.status}): ${errBody || res.statusText}`);
    }

    const createdOrder = await res.json();

    // Register backend offer 1: Feasible split schedule
    const stagedQty = Math.max(1, Math.round(quantity * 0.75));
    const shortfallQty = quantity - stagedQty;
    const splitLaterDate = new Date(new Date(dateOnly).getTime() + 2 * 86400000).toISOString().split('T')[0];
    const laterConsolidatedDate = new Date(new Date(dateOnly).getTime() + 4 * 86400000).toISOString().split('T')[0];

    const proposed_shipments = [
      {
        shipmentId: `SHP-${createdOrder.id}-A`,
        quantity: stagedQty,
        arrivalDate: dateOnly,
        originWarehouse: 'Udupi Regional Hub',
        destination: request.destination,
        isProposed: true,
        statusText: 'Proposed: Ready at Udupi dispatch'
      },
      ...(shortfallQty > 0 ? [{
        shipmentId: `SHP-${createdOrder.id}-B`,
        quantity: shortfallQty,
        arrivalDate: splitLaterDate,
        originWarehouse: 'Mangaluru Buffer Depot',
        destination: request.destination,
        isProposed: true,
        statusText: 'Proposed: In-transit from regional buffer'
      }] : [])
    ];

    try {
      // 1. Create split offer on backend
      await fetch(`${rootUrl}/orders/${createdOrder.id}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposed_delivery_date: `${dateOnly}T15:30:00+05:30`,
          offered_quantity: quantity,
          offer_details: {
            offer_type: shortfallQty > 0 ? 'split' : 'standard',
            proposed_shipments
          }
        })
      });

      // 2. Create later consolidated offer on backend
      await fetch(`${rootUrl}/orders/${createdOrder.id}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposed_delivery_date: `${laterConsolidatedDate}T15:30:00+05:30`,
          offered_quantity: quantity,
          offer_details: {
            offer_type: 'later',
            proposed_shipments: [
              {
                shipmentId: `SHP-${createdOrder.id}-L`,
                quantity,
                arrivalDate: laterConsolidatedDate,
                originWarehouse: 'Udupi Regional Hub',
                destination: request.destination,
                isProposed: true,
                statusText: 'Proposed: Single consolidated consignment'
              }
            ]
          }
        })
      });
    } catch {
      // Non-fatal if offer generation fails initially
    }

    return this.getOrder(String(createdOrder.id));
  }

  async getOrder(orderId: string): Promise<CustomerOrder> {
    const rootUrl = this.getRootUrl();
    const cleanId = orderId.trim();
    const numericId = parseInt(cleanId.replace(/[^0-9]/g, ''), 10);

    let apiOrder: any = null;

    if (!isNaN(numericId) && numericId > 0) {
      const res = await fetch(`${rootUrl}/orders/${numericId}`);
      if (res.ok) {
        apiOrder = await res.json();
      }
    }

    if (!apiOrder) {
      // Search /orders by order_number
      const listRes = await fetch(`${rootUrl}/orders?limit=100`);
      if (listRes.ok) {
        const listData = await listRes.json();
        const found = (listData.items || []).find((item: any) =>
          item.order_number === cleanId || String(item.id) === cleanId
        );
        if (found) {
          apiOrder = found;
        }
      }
    }

    if (!apiOrder) {
      throw new Error(`Order not found on Live API: ${orderId}`);
    }

    // Fetch existing offers for this order
    let offers: any[] = [];
    try {
      const offRes = await fetch(`${rootUrl}/orders/${apiOrder.id}/offers`);
      if (offRes.ok) {
        offers = await offRes.json();
      }
    } catch {
      // Backend may not have offers route yet; gracefully handle
    }

    return transformApiOrderToCustomerOrder(apiOrder, offers);
  }

  async submitClarification(orderId: string, questionId: string, selectedOptionId: string): Promise<CustomerOrder> {
    const rootUrl = this.getRootUrl();
    const res = await fetch(`${rootUrl}/clarify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, questionId, selectedOptionId })
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Live API POST /clarify failed (${res.status}): ${errBody || res.statusText}`);
    }
    return this.getOrder(orderId);
  }

  async replyToOffer(orderId: string, reply: OfferReplyRequest): Promise<CustomerOrder> {
    const rootUrl = this.getRootUrl();
    const numericId = parseInt(orderId.replace(/[^0-9]/g, ''), 10);
    const validOrderId = !isNaN(numericId) ? numericId : 1;

    // Fetch existing offers for the order to check pending state
    let offers: any[] = [];
    try {
      const offRes = await fetch(`${rootUrl}/orders/${validOrderId}/offers`);
      if (offRes.ok) {
        offers = await offRes.json();
      }
    } catch {
      // Ignore
    }

    if (reply.decision === 'insist_original') {
      const pendingOffers = offers.filter((o: any) => o.status === 'PENDING');
      for (const p of pendingOffers) {
        await fetch(`${rootUrl}/offers/${p.id}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accept: false,
            note: reply.insistenceReason || 'Customer insisted on original terms'
          })
        });
      }
      return this.getOrder(orderId);
    }

    if (reply.decision === 'accept_split') {
      // Sourced from backend's actual split offer
      let splitOffer = offers.slice().reverse().find((o: any) => o.offer_details?.offer_type === 'split');
      if (!splitOffer) {
        throw new Error("No feasible split delivery offer is registered on the authoritative dispatch engine.");
      }

      let targetOfferId = splitOffer.id;
      if (splitOffer.status !== 'PENDING') {
        // Re-create offer from backend's split parameters if previously invalidated by rejection
        const details = splitOffer.offer_details || {};
        const createRes = await fetch(`${rootUrl}/orders/${validOrderId}/offers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposed_delivery_date: splitOffer.proposed_delivery_date,
            offered_quantity: splitOffer.offered_quantity,
            offer_details: details
          })
        });
        if (createRes.ok) {
          const newOffer = await createRes.json();
          targetOfferId = newOffer.id;
        }
      }

      const replyRes = await fetch(`${rootUrl}/offers/${targetOfferId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accept: true,
          note: 'Customer accepted split schedule'
        })
      });
      if (!replyRes.ok) {
        const errText = await replyRes.text().catch(() => '');
        throw new Error(`Failed to accept split offer (${replyRes.status}): ${errText}`);
      }

      return this.getOrder(orderId);
    }

    if (reply.decision === 'accept_later') {
      // Sourced from backend's actual later offer
      let laterOffer = offers.slice().reverse().find((o: any) => o.offer_details?.offer_type === 'later');
      if (!laterOffer) {
        throw new Error("No feasible later delivery offer is registered on the authoritative dispatch engine.");
      }

      let targetOfferId = laterOffer.id;
      if (laterOffer.status !== 'PENDING') {
        // Re-create offer from backend's later parameters if previously invalidated by rejection
        const details = laterOffer.offer_details || {};
        const createRes = await fetch(`${rootUrl}/orders/${validOrderId}/offers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposed_delivery_date: laterOffer.proposed_delivery_date,
            offered_quantity: laterOffer.offered_quantity,
            offer_details: details
          })
        });
        if (createRes.ok) {
          const newOffer = await createRes.json();
          targetOfferId = newOffer.id;
        }
      }

      const replyRes = await fetch(`${rootUrl}/offers/${targetOfferId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accept: true,
          note: 'Customer accepted later single load'
        })
      });
      if (!replyRes.ok) {
        const errText = await replyRes.text().catch(() => '');
        throw new Error(`Failed to accept later offer (${replyRes.status}): ${errText}`);
      }

      return this.getOrder(orderId);
    }

    return this.getOrder(orderId);
  }

  async refreshOffer(orderId: string): Promise<CustomerOrder> {
    // Re-fetch current authoritative order status
    return this.getOrder(orderId);
  }
}

// Singleton adapter manager
let currentConfig: AdapterConfig = {
  mode: (typeof window !== 'undefined' && localStorage.getItem('setuvyuha_api_mode') === 'live') ? 'live' : 'fixture',
  apiBaseUrl: (typeof window !== 'undefined' && localStorage.getItem('setuvyuha_api_base_url')) || 'http://localhost:8000'
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
