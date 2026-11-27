import type { CustomerOrder } from '../types/order.ts';

export const SEEDED_SCENARIOS: Record<string, CustomerOrder> = {
  // Scenario 1: Signature Split Offer (Warehouse count adjusted to 40, offer: 40 on Fri, 10 on Sun)
  'ORD-2026-MANIPAL-50': {
    orderId: 'ORD-2026-MANIPAL-50',
    version: 1,
    status: 'offer_issued',
    requestedDetails: {
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-11-27', // Friday
      mustArriveTogether: false,
      notes: 'Required for university exhibition opening'
    },
    activeOffer: {
      offerId: 'OFF-UDUPI-SPLIT-8841',
      version: 1,
      orderId: 'ORD-2026-MANIPAL-50',
      offerType: 'split',
      proposedShipments: [
        {
          shipmentId: 'SHP-PROP-40A',
          quantity: 40,
          arrivalDate: '2026-11-27', // Friday
          originWarehouse: 'Udupi Regional Hub',
          destination: 'Manipal Commercial Center, Shop #14',
          isProposed: true,
          statusText: 'Proposed: Ready at Udupi dispatch'
        },
        {
          shipmentId: 'SHP-PROP-10B',
          quantity: 10,
          arrivalDate: '2026-11-29', // Sunday
          originWarehouse: 'Mangalore Buffer Depot via Udupi',
          destination: 'Manipal Commercial Center, Shop #14',
          isProposed: true,
          statusText: 'Proposed: In-transit from regional buffer'
        }
      ],
      expiresAt: new Date(Date.now() + 1800000).toISOString(), // 30 min from now
      permittedActions: ['accept_split', 'accept_later', 'insist_original', 'decline'],
      notes: 'Warehouse physical count reconciliation identified 40 units available immediately at Udupi. Remaining 10 units sourced from regional buffer.'
    },
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:15:00Z'
  },

  // Scenario 2: Clarification Inline Required
  'ORD-2026-MANIPAL-CLARIFY': {
    orderId: 'ORD-2026-MANIPAL-CLARIFY',
    version: 1,
    status: 'clarifying',
    requestedDetails: {
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: false,
      notes: 'Need delivery by Friday'
    },
    clarificationPrompt: {
      questionId: 'Q-DATE-MEANING-01',
      field: 'arrivalDate',
      questionText: 'Fulfilment Timing Verification: How should "Friday" be scheduled?',
      options: [
        {
          id: 'arrive_by_friday',
          label: 'Arrive at destination by Friday (Nov 27)',
          description: 'Shipment delivered to shop dock before close of business Friday.'
        },
        {
          id: 'dispatch_by_friday',
          label: 'Leave the warehouse by Friday (Nov 27)',
          description: 'Shipment dispatched from Udupi Friday, delivering over the weekend.'
        }
      ]
    },
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:05:00Z'
  },

  // Scenario 3: Later Delivery Offer (All 50 together on Tuesday)
  'ORD-2026-MANIPAL-LATER': {
    orderId: 'ORD-2026-MANIPAL-LATER',
    version: 2,
    status: 'offer_issued',
    requestedDetails: {
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: true,
      notes: 'Must arrive in single consignment'
    },
    activeOffer: {
      offerId: 'OFF-UDUPI-LATER-9920',
      version: 2,
      orderId: 'ORD-2026-MANIPAL-LATER',
      offerType: 'later',
      proposedShipments: [
        {
          shipmentId: 'SHP-PROP-50L',
          quantity: 50,
          arrivalDate: '2026-12-01', // Tuesday
          originWarehouse: 'Udupi Consolidated Consolidation',
          destination: 'Manipal Commercial Center, Shop #14',
          isProposed: true,
          statusText: 'Proposed: Single consignment following buffer replenishment'
        }
      ],
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
      permittedActions: ['accept_later', 'insist_original', 'decline'],
      notes: 'To deliver all 50 units together in one shipment, arrival is scheduled for Tuesday, Dec 1, 2026.'
    },
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:20:00Z'
  },

  // Scenario 4: Original Terms Insisted (Recovery check pending)
  'ORD-2026-MANIPAL-PENDING': {
    orderId: 'ORD-2026-MANIPAL-PENDING',
    version: 2,
    status: 'recovery_pending',
    requestedDetails: {
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: true
    },
    lastCustomerDecision: 'insist_original',
    customerDelayReason: 'Customer confirmed requirement: all 50 units together by Friday, Nov 27. Dispatch engine is scanning inter-hub express transfers.',
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:30:00Z'
  },

  // Scenario 5: Confirmed Split Schedule (2 shipments: 40 on Fri, 10 on Sun)
  'ORD-2026-MANIPAL-CONFIRMED-SPLIT': {
    orderId: 'ORD-2026-MANIPAL-CONFIRMED-SPLIT',
    version: 3,
    status: 'confirmed',
    requestedDetails: {
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: false
    },
    confirmedShipments: [
      {
        shipmentId: 'SHP-CNF-40-A',
        quantity: 40,
        arrivalDate: '2026-11-27',
        originWarehouse: 'Udupi Central Warehouse',
        destination: 'Manipal Commercial Center, Shop #14',
        carrierTrackingRef: 'STV-UD-4081',
        isProposed: false,
        statusText: 'Confirmed: Staged for loading'
      },
      {
        shipmentId: 'SHP-CNF-10-B',
        quantity: 10,
        arrivalDate: '2026-11-29',
        originWarehouse: 'Mangalore Buffer Depot',
        destination: 'Manipal Commercial Center, Shop #14',
        carrierTrackingRef: 'STV-UD-4082',
        isProposed: false,
        statusText: 'Confirmed: Buffer transit booked'
      }
    ],
    lastCustomerDecision: 'accept_split',
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:45:00Z'
  },

  // Scenario 6: Confirmed Later Delivery (50 on Tuesday)
  'ORD-2026-MANIPAL-CONFIRMED-LATER': {
    orderId: 'ORD-2026-MANIPAL-CONFIRMED-LATER',
    version: 3,
    status: 'confirmed',
    requestedDetails: {
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: true
    },
    confirmedShipments: [
      {
        shipmentId: 'SHP-CNF-50-L',
        quantity: 50,
        arrivalDate: '2026-12-01',
        originWarehouse: 'Udupi Consolidated Consolidation',
        destination: 'Manipal Commercial Center, Shop #14',
        carrierTrackingRef: 'STV-UD-4099',
        isProposed: false,
        statusText: 'Confirmed: Single shipment consolidated'
      }
    ],
    lastCustomerDecision: 'accept_later',
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:40:00Z'
  },

  // Scenario 7: Unavoidable Delay / Backlog
  'ORD-2026-MANIPAL-DELAY': {
    orderId: 'ORD-2026-MANIPAL-DELAY',
    version: 3,
    status: 'unavoidable_delay',
    requestedDetails: {
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: false
    },
    confirmedShipments: [
      {
        shipmentId: 'SHP-CNF-40-PARTIAL',
        quantity: 40,
        arrivalDate: '2026-11-27',
        originWarehouse: 'Udupi Central Warehouse',
        destination: 'Manipal Commercial Center, Shop #14',
        carrierTrackingRef: 'STV-UD-4081',
        isProposed: false,
        statusText: 'Dispatched: On delivery vehicle'
      }
    ],
    backlogQuantity: 10,
    customerDelayReason: 'Remaining 10 units delayed due to supplier intake backlog. Earliest projected arrival is Wednesday, Dec 02.',
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T09:00:00Z'
  },

  // Scenario 8: Expired Offer
  'ORD-2026-MANIPAL-EXPIRED': {
    orderId: 'ORD-2026-MANIPAL-EXPIRED',
    version: 1,
    status: 'expired',
    requestedDetails: {
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: false
    },
    activeOffer: {
      offerId: 'OFF-UDUPI-EXPIRED-771',
      version: 1,
      orderId: 'ORD-2026-MANIPAL-EXPIRED',
      offerType: 'split',
      proposedShipments: [
        {
          shipmentId: 'SHP-EXP-40',
          quantity: 40,
          arrivalDate: '2026-11-27',
          originWarehouse: 'Udupi Regional Hub',
          destination: 'Manipal Commercial Center, Shop #14',
          isProposed: true,
          statusText: 'Offer Window Closed'
        },
        {
          shipmentId: 'SHP-EXP-10',
          quantity: 10,
          arrivalDate: '2026-11-29',
          originWarehouse: 'Mangalore Buffer Depot',
          destination: 'Manipal Commercial Center, Shop #14',
          isProposed: true,
          statusText: 'Offer Window Closed'
        }
      ],
      expiresAt: '2026-11-27T08:30:00Z', // In the past
      permittedActions: [],
      notes: 'This proposal was held for 30 minutes and has expired. Re-run dispatch to obtain updated stock schedule.'
    },
    createdAt: '2026-11-27T07:30:00Z',
    updatedAt: '2026-11-27T08:31:00Z'
  },

  // Scenario 9: Agricultural Water Pump Split Offer (Distinct non-fan product)
  'ORD-2026-BRAHMAVAR-20-PUMP': {
    orderId: 'ORD-2026-BRAHMAVAR-20-PUMP',
    version: 1,
    status: 'offer_issued',
    requestedDetails: {
      itemSku: 'PMP-SUB-05-AGR',
      itemName: '0.5 HP Submersible Agricultural Water Pump',
      quantity: 20,
      destination: 'Brahmavar Agro Cooperative Society, Warehouse #3',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: false,
      notes: 'Required for scheduled kharif irrigation installation'
    },
    activeOffer: {
      offerId: 'OFF-MANG-PUMP-4412',
      version: 1,
      orderId: 'ORD-2026-BRAHMAVAR-20-PUMP',
      offerType: 'split',
      proposedShipments: [
        {
          shipmentId: 'SHP-PROP-15P',
          quantity: 15,
          arrivalDate: '2026-11-27',
          originWarehouse: 'Mangalore Industrial Depot',
          destination: 'Brahmavar Agro Cooperative Society, Warehouse #3',
          isProposed: true,
          statusText: 'Proposed: Ready at Mangalore dispatch'
        },
        {
          shipmentId: 'SHP-PROP-05P',
          quantity: 5,
          arrivalDate: '2026-11-29',
          originWarehouse: 'Udupi Buffer Yard',
          destination: 'Brahmavar Agro Cooperative Society, Warehouse #3',
          isProposed: true,
          statusText: 'Proposed: Staged from buffer transfer'
        }
      ],
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
      permittedActions: ['accept_split', 'accept_later', 'insist_original', 'decline'],
      notes: 'Warehouse physical count reconciliation identified 15 pumps available immediately at Mangalore Industrial Depot. Remaining 5 pumps sourced from Udupi Buffer Yard.'
    },
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:15:00Z'
  }
};
