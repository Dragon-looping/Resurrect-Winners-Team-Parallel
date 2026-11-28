export type OrderStatus = 
  | 'draft'
  | 'clarifying'
  | 'offer_issued'
  | 'recovery_pending'
  | 'confirmed'
  | 'unavoidable_delay'
  | 'expired';

export type OfferType = 'split' | 'later' | 'standard';

export type CustomerDecision = 
  | 'accept_split'
  | 'accept_later'
  | 'insist_original'
  | 'decline';

export interface ShipmentItem {
  shipmentId: string;
  quantity: number;
  arrivalDate: string; // ISO date e.g. '2026-11-27'
  originWarehouse: string; // e.g. 'Udupi Central Warehouse'
  destination: string; // e.g. 'Manipal Retail Hub'
  carrierTrackingRef?: string;
  isProposed?: boolean;
  statusText?: string;
}

export interface OfferProposal {
  offerId: string;
  version: number;
  orderId: string;
  offerType: OfferType;
  proposedShipments: ShipmentItem[];
  expiresAt: string; // ISO timestamp
  permittedActions: CustomerDecision[];
  notes?: string;
}

export interface ClarificationPrompt {
  questionId: string;
  questionText: string;
  field: 'arrivalDate' | 'mustArriveTogether' | 'destination';
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
}

export interface DeliveryRequest {
  itemSku: string;
  itemName: string;
  quantity: number;
  destination: string;
  requestedArrivalDate: string; // ISO date
  mustArriveTogether: boolean;
  notes?: string;
}

export interface CustomerOrder {
  orderId: string;
  version: number;
  status: OrderStatus;
  requestedDetails: DeliveryRequest;
  clarificationPrompt?: ClarificationPrompt;
  activeOffer?: OfferProposal;
  availableOffers?: {
    split?: OfferProposal;
    later?: OfferProposal;
  };
  confirmedShipments?: ShipmentItem[];
  backlogQuantity?: number;
  customerDelayReason?: string;
  lastCustomerDecision?: CustomerDecision;
  createdAt: string;
  updatedAt: string;
}

export interface OfferReplyRequest {
  offerId: string;
  offerVersion: number;
  decision: CustomerDecision;
  insistenceReason?: string;
}

export interface AdapterConfig {
  mode: 'fixture' | 'live';
  apiBaseUrl: string;
}
