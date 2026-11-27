import { GodownNode, PlannerOrder } from '../types/planner.ts';

export const GODOWN_NODES: GodownNode[] = [
  { id: 'UDUPI', label: 'Udupi Central', kind: 'plant', x: 95, y: 125, stockSummary: '40 fans · 5 pumps' },
  { id: 'MANGALORE', label: 'Mangalore Buffer', kind: 'depot', x: 115, y: 235, stockSummary: '18 fans · 15 pumps' },
  { id: 'HASSAN', label: 'Hassan Express', kind: 'depot', x: 260, y: 225, stockSummary: 'Spare reserve' },
  { id: 'MANIPAL', label: 'Manipal Shop #14', kind: 'customer', x: 245, y: 95 },
  { id: 'KUNDAPURA', label: 'Kundapura #7', kind: 'customer', x: 195, y: 38 },
  { id: 'BRAHMAVAR', label: 'Brahmavar Agro #3', kind: 'customer', x: 350, y: 145 }
];

export const SEEDED_PLANNER_ORDERS: Record<string, PlannerOrder> = {
  'ORD-2026-MANIPAL-50': {
    orderId: 'ORD-2026-MANIPAL-50',
    version: 3,
    itemSku: 'FAN-HV-24-IND',
    itemName: 'High-Velocity 24" Industrial Pedestal Fans',
    quantity: 50,
    unitLabel: 'fans',
    destination: 'Manipal Commercial Center, Shop #14',
    customerLabel: 'Manipal Retail (#14)',
    riskStatus: 'at_risk',
    telemetry: {
      agreedArrival: '2026-11-27 17:00',
      projectedShip: '2026-11-27 13:30',
      projectedArrival: '2026-11-27 16:45',
      backlogUnits: 10,
      stockOutRiskPercent: 78,
      isFeedStale: true,
      feedLastUpdatedAt: '2026-11-27T08:15:00Z',
      staleReason: 'Udupi bin-audit telemetry is 22 min old (physical count corrected 50 -> 40).',
      dispatchCutoff: '16:30',
      streamConnected: false
    },
    offerSummary: {
      offerId: 'OFF-UDUPI-SPLIT-8841',
      offerType: 'split',
      shipments: [
        {
          shipmentId: 'SHP-PROP-40A',
          quantity: 40,
          arrivalDate: '2026-11-27',
          origin: 'Udupi Regional Hub',
          destination: 'Manipal Commercial Center, Shop #14'
        },
        {
          shipmentId: 'SHP-PROP-10B',
          quantity: 10,
          arrivalDate: '2026-11-29',
          origin: 'Mangalore Buffer Depot',
          destination: 'Manipal Commercial Center, Shop #14'
        }
      ],
      customerResponse: 'pending',
      permittedPlannerActions: ['approve_recovery', 'issue_split', 'issue_later', 'record_delay'],
      originalPromisePreserved: true,
      notes: 'Customer has not yet replied to split offer. Original promise (50 fans by Fri 17:00) remains preserved.'
    },
    selectedCandidateId: 'CAND-SWAP-MANGALORE',
    candidates: [
      {
        candidateId: 'CAND-SWAP-MANGALORE',
        strategy: 'swap',
        title: 'Safe Inter-Order Swap (Mangalore Buffer -> Manipal)',
        summary: 'Reallocate 10 reserved fans from Mangalore Depot (Donor: ORD-2026-KUNDAPURA-30, whose deadline is Mon Nov 30) to Manipal via afternoon trunk.',
        sourcePlant: 'Mangalore Buffer',
        donorOrderId: 'ORD-2026-KUNDAPURA-30',
        donorCustomer: 'Kundapura #7',
        feasible: true,
        cutoffRequired: '16:00',
        highlightedNodeIds: ['UDUPI', 'MANGALORE', 'MANIPAL', 'KUNDAPURA'],
        affectedCustomerLabels: ['Manipal Shop #14 (50 fans)', 'Kundapura #7 (30 fans)'],
        routeLegs: [
          {
            legId: 'LEG-1',
            fromNodeId: 'UDUPI',
            toNodeId: 'MANIPAL',
            fromLabel: 'Udupi Central',
            toLabel: 'Manipal Shop #14',
            units: 40,
            departTime: '13:30',
            arriveTime: '14:15',
            affectedOrderId: 'ORD-2026-MANIPAL-50',
            affectedCustomer: 'Manipal Shop #14'
          },
          {
            legId: 'LEG-2',
            fromNodeId: 'MANGALORE',
            toNodeId: 'MANIPAL',
            fromLabel: 'Mangalore Buffer',
            toLabel: 'Manipal Shop #14',
            units: 10,
            departTime: '14:00',
            arriveTime: '16:10',
            affectedOrderId: 'ORD-2026-MANIPAL-50',
            affectedCustomer: 'Manipal Shop #14'
          },
          {
            legId: 'LEG-3',
            fromNodeId: 'UDUPI',
            toNodeId: 'KUNDAPURA',
            fromLabel: 'Udupi Central (replenished)',
            toLabel: 'Kundapura #7',
            units: 30,
            departTime: 'Sat 09:00',
            arriveTime: 'Sat 10:30',
            affectedOrderId: 'ORD-2026-KUNDAPURA-30',
            affectedCustomer: 'Kundapura #7'
          }
        ]
      },
      {
        candidateId: 'CAND-SPARE-HASSAN',
        strategy: 'spare_sourcing',
        title: 'Express Spare Sourcing (Hassan Hub)',
        summary: 'Dispatch 10 spare units from Hassan Express on dedicated light commercial van to arrive before Manipal cutoff.',
        sourcePlant: 'Hassan Express',
        feasible: true,
        cutoffRequired: '13:00',
        highlightedNodeIds: ['UDUPI', 'HASSAN', 'MANIPAL'],
        affectedCustomerLabels: ['Manipal Shop #14 (50 fans)'],
        routeLegs: [
          {
            legId: 'LEG-4',
            fromNodeId: 'UDUPI',
            toNodeId: 'MANIPAL',
            fromLabel: 'Udupi Central',
            toLabel: 'Manipal Shop #14',
            units: 40,
            departTime: '13:30',
            arriveTime: '14:15',
            affectedOrderId: 'ORD-2026-MANIPAL-50',
            affectedCustomer: 'Manipal Shop #14'
          },
          {
            legId: 'LEG-5',
            fromNodeId: 'HASSAN',
            toNodeId: 'MANIPAL',
            fromLabel: 'Hassan Express',
            toLabel: 'Manipal Shop #14',
            units: 10,
            departTime: '12:30',
            arriveTime: '16:25',
            affectedOrderId: 'ORD-2026-MANIPAL-50',
            affectedCustomer: 'Manipal Shop #14'
          }
        ]
      },
      {
        candidateId: 'CAND-WAIT-REPLENISH',
        strategy: 'wait',
        title: 'Wait for Sunday Buffer Replenishment',
        summary: 'Ship 40 fans today and hold remaining 10 fans until Sunday intake arrives.',
        sourcePlant: 'Udupi Central',
        feasible: false,
        infeasibilityReason: 'Misses agreed Friday 17:00 deadline by 48 hours unless customer accepts split offer.',
        cutoffRequired: '16:30',
        highlightedNodeIds: ['UDUPI', 'MANIPAL'],
        affectedCustomerLabels: ['Manipal Shop #14 (10 fans delayed)'],
        routeLegs: [
          {
            legId: 'LEG-6',
            fromNodeId: 'UDUPI',
            toNodeId: 'MANIPAL',
            fromLabel: 'Udupi Central',
            toLabel: 'Manipal Shop #14',
            units: 40,
            departTime: '13:30',
            arriveTime: '14:15',
            affectedOrderId: 'ORD-2026-MANIPAL-50',
            affectedCustomer: 'Manipal Shop #14'
          }
        ]
      }
    ],
    optionComparisons: [
      {
        strategy: 'wait',
        label: 'Wait (Split / Delay)',
        affectedOrders: ['ORD-2026-MANIPAL-50'],
        freightCostInr: 3200,
        slaPenaltyInr: 12000,
        orderRevenueInr: 185000,
        remainingMarginInr: 21800,
        marginDeltaLabel: '-₹12,000 SLA risk',
        feasible: false
      },
      {
        strategy: 'spare_sourcing',
        label: 'Spare Sourcing (Hassan)',
        affectedOrders: ['ORD-2026-MANIPAL-50'],
        freightCostInr: 11800,
        slaPenaltyInr: 0,
        orderRevenueInr: 185000,
        remainingMarginInr: 25200,
        marginDeltaLabel: '-₹8,600 extra freight',
        feasible: true
      },
      {
        strategy: 'swap',
        label: 'Safe Swap (Mangalore -> Manipal)',
        affectedOrders: ['ORD-2026-MANIPAL-50', 'ORD-2026-KUNDAPURA-30'],
        freightCostInr: 4900,
        slaPenaltyInr: 0,
        orderRevenueInr: 296000,
        remainingMarginInr: 51100,
        marginDeltaLabel: 'Best margin (+₹25,900 vs spare)',
        feasible: true
      }
    ],
    historicalCases: {
      originalQuery: '50 industrial pedestal fans short 10 units at Udupi hub before Friday 17:00 Manipal exhibition deadline',
      steeredQueryTemplate: 'Inter-depot buffer swap from Mangalore vs express spare van for coastal Karnataka retail SLA',
      points: [
        {
          caseId: 'CASE-2025-114',
          title: 'Nov 2025 Manipal Tech Fest Fan Reallocation',
          x: 78,
          y: 74,
          baseSimilarity: 0.91,
          steeredSimilarity: 0.96,
          outcome: 'Swapped 12 units from Mangalore Buffer; 0 SLA penalty, +₹19,400 saved.',
          sku: 'FAN-HV-24-IND',
          evidenceRef: 'LOG-2025-114-EV',
          roleBriefings: {
            planner: 'Approve swap only if Mangalore trunk departs before 16:00 cutoff; donor order was non-urgent.',
            warehouse: 'Pre-stage 40 units at Udupi Bay 2 while Mangalore 10-unit pallet merges at Padubidri.',
            purchasing: 'Trigger 10-unit replenishment PO immediately so Monday donor dispatch is covered.'
          }
        },
        {
          caseId: 'CASE-2025-089',
          title: 'Oct 2025 Udupi Cyclone Backup Van',
          x: 44,
          y: 62,
          baseSimilarity: 0.82,
          steeredSimilarity: 0.71,
          outcome: 'Used Hassan express van; arrived 20 min before cutoff at ₹11,400 freight.',
          sku: 'FAN-HV-24-IND',
          evidenceRef: 'LOG-2025-089-EV',
          roleBriefings: {
            planner: 'Reserve Hassan van only when Mangalore donor window closes.',
            warehouse: 'Hold receiving dock open until 17:00.',
            purchasing: 'No urgent PO needed; standard weekly cycle.'
          }
        },
        {
          caseId: 'CASE-2024-212',
          title: 'Dec 2024 Brahmavar Pump Split Delay',
          x: 26,
          y: 34,
          baseSimilarity: 0.61,
          steeredSimilarity: 0.49,
          outcome: 'Customer declined split; SLA penalty ₹9,500 incurred.',
          sku: 'PMP-SUB-05-AGR',
          evidenceRef: 'LOG-2024-212-EV',
          roleBriefings: {
            planner: 'Avoid waiting strategy when customer marked single-consignment preference.',
            warehouse: 'Consolidate partial picks in quarantine zone.',
            purchasing: 'Escalate supplier ETA confirmation before promising Tuesday date.'
          }
        }
      ]
    },
    purchasing: {
      shortageId: 'SHRT-UDUPI-FAN-10',
      sku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      shortageUnits: 10,
      batchCode: 'BATCH-26-11-KRN',
      supplierName: 'Kaveri Industrial Electrics Pvt Ltd',
      supplierEmail: 'dispatch@kaverielectrics.in',
      supplierEta: '2026-11-29 09:00',
      unitPriceInr: 2950,
      totalPriceInr: 29500,
      evidenceCitation: 'Bin Audit #AUD-4092 (physical count 40 vs ledger 50) + Mangalore swap replenishment'
    }
  },

  'ORD-2026-KUNDAPURA-30': {
    orderId: 'ORD-2026-KUNDAPURA-30',
    version: 1,
    itemSku: 'FAN-HV-24-IND',
    itemName: 'High-Velocity 24" Industrial Pedestal Fans',
    quantity: 30,
    unitLabel: 'fans',
    destination: 'Kundapura Market Road, Shop #7',
    customerLabel: 'Kundapura #7',
    riskStatus: 'on_track',
    telemetry: {
      agreedArrival: '2026-11-30 14:00',
      projectedShip: '2026-11-29 09:00',
      projectedArrival: '2026-11-30 11:00',
      backlogUnits: 0,
      stockOutRiskPercent: 12,
      isFeedStale: false,
      feedLastUpdatedAt: '2026-11-27T08:40:00Z',
      dispatchCutoff: '18:00',
      streamConnected: true
    },
    offerSummary: {
      offerId: 'OFF-KUND-STD-102',
      offerType: 'standard',
      shipments: [
        {
          shipmentId: 'SHP-KUND-30',
          quantity: 30,
          arrivalDate: '2026-11-30',
          origin: 'Mangalore Buffer Depot',
          destination: 'Kundapura Market Road, Shop #7'
        }
      ],
      customerResponse: 'accepted_later',
      permittedPlannerActions: ['approve_recovery', 'hold_promise'],
      originalPromisePreserved: true,
      notes: 'Eligible donor order for Manipal swap if Udupi replenishment lands before Sat 18:00.'
    },
    selectedCandidateId: 'CAND-KUND-STD',
    candidates: [
      {
        candidateId: 'CAND-KUND-STD',
        strategy: 'wait',
        title: 'Standard Scheduled Dispatch',
        summary: 'Ship 30 fans from Mangalore/Udupi for Monday morning arrival.',
        sourcePlant: 'Mangalore Buffer',
        feasible: true,
        cutoffRequired: '18:00',
        highlightedNodeIds: ['MANGALORE', 'KUNDAPURA'],
        affectedCustomerLabels: ['Kundapura #7 (30 fans)'],
        routeLegs: [
          {
            legId: 'LEG-K1',
            fromNodeId: 'MANGALORE',
            toNodeId: 'KUNDAPURA',
            fromLabel: 'Mangalore Buffer',
            toLabel: 'Kundapura #7',
            units: 30,
            departTime: 'Mon 07:30',
            arriveTime: 'Mon 11:00',
            affectedOrderId: 'ORD-2026-KUNDAPURA-30',
            affectedCustomer: 'Kundapura #7'
          }
        ]
      }
    ],
    optionComparisons: [
      {
        strategy: 'wait',
        label: 'Standard Schedule',
        affectedOrders: ['ORD-2026-KUNDAPURA-30'],
        freightCostInr: 2400,
        slaPenaltyInr: 0,
        orderRevenueInr: 111000,
        remainingMarginInr: 29300,
        marginDeltaLabel: 'Baseline',
        feasible: true
      }
    ],
    historicalCases: {
      originalQuery: '30 fans standard coastal trunk to Kundapura',
      steeredQueryTemplate: 'Kundapura Monday replenishment route',
      points: [
        {
          caseId: 'CASE-2025-114',
          title: 'Nov 2025 Manipal Tech Fest Fan Reallocation',
          x: 75,
          y: 70,
          baseSimilarity: 0.78,
          steeredSimilarity: 0.85,
          outcome: 'Donor order delivered on time via Udupi replenishment.',
          sku: 'FAN-HV-24-IND',
          evidenceRef: 'LOG-2025-114-EV',
          roleBriefings: {
            planner: 'Safe to lend 10 units to urgent Friday orders.',
            warehouse: 'Replenish bay before Saturday evening.',
            purchasing: 'Covered by Batch #26-11-KRN.'
          }
        }
      ]
    },
    purchasing: {
      shortageId: 'SHRT-KUND-0',
      sku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      shortageUnits: 0,
      batchCode: 'BATCH-26-11-KRN',
      supplierName: 'Kaveri Industrial Electrics Pvt Ltd',
      supplierEmail: 'dispatch@kaverielectrics.in',
      supplierEta: '2026-11-29 09:00',
      unitPriceInr: 2950,
      totalPriceInr: 0,
      evidenceCitation: 'No shortage on Kundapura baseline.'
    }
  },

  'ORD-2026-BRAHMAVAR-20-PUMP': {
    orderId: 'ORD-2026-BRAHMAVAR-20-PUMP',
    version: 2,
    itemSku: 'PMP-SUB-05-AGR',
    itemName: '0.5 HP Submersible Agricultural Water Pump',
    quantity: 20,
    unitLabel: 'pumps',
    destination: 'Brahmavar Agro Cooperative Society, Warehouse #3',
    customerLabel: 'Brahmavar Agro (#3)',
    riskStatus: 'critical_shortage',
    telemetry: {
      agreedArrival: '2026-11-27 17:00',
      projectedShip: '2026-11-27 14:00',
      projectedArrival: '2026-11-29 12:00',
      backlogUnits: 5,
      stockOutRiskPercent: 86,
      isFeedStale: false,
      feedLastUpdatedAt: '2026-11-27T08:42:00Z',
      dispatchCutoff: '15:30',
      streamConnected: true
    },
    offerSummary: {
      offerId: 'OFF-MANG-PUMP-4412',
      offerType: 'split',
      shipments: [
        {
          shipmentId: 'SHP-PROP-15P',
          quantity: 15,
          arrivalDate: '2026-11-27',
          origin: 'Mangalore Industrial Depot',
          destination: 'Brahmavar Agro Cooperative Society, Warehouse #3'
        },
        {
          shipmentId: 'SHP-PROP-05P',
          quantity: 5,
          arrivalDate: '2026-11-29',
          origin: 'Udupi Buffer Yard',
          destination: 'Brahmavar Agro Cooperative Society, Warehouse #3'
        }
      ],
      customerResponse: 'insisted_original',
      permittedPlannerActions: ['approve_recovery', 'record_delay'],
      originalPromisePreserved: true,
      notes: 'Customer insisted on all 20 pumps by Friday. 5-pump shortage requires emergency PO or unavoidable delay notice.'
    },
    selectedCandidateId: 'CAND-PUMP-WAIT',
    candidates: [
      {
        candidateId: 'CAND-PUMP-WAIT',
        strategy: 'wait',
        title: 'Hold for Buffer Intake (Unavoidable Delay)',
        summary: 'Ship 15 pumps today and schedule 5 pumps on Sunday intake; no regional donor available.',
        sourcePlant: 'Mangalore Buffer',
        feasible: false,
        infeasibilityReason: 'No swap donor for 0.5 HP submersible pumps within cutoff.',
        cutoffRequired: '15:30',
        highlightedNodeIds: ['MANGALORE', 'UDUPI', 'BRAHMAVAR'],
        affectedCustomerLabels: ['Brahmavar Agro #3 (5 pumps delayed)'],
        routeLegs: [
          {
            legId: 'LEG-P1',
            fromNodeId: 'MANGALORE',
            toNodeId: 'BRAHMAVAR',
            fromLabel: 'Mangalore Buffer',
            toLabel: 'Brahmavar Agro #3',
            units: 15,
            departTime: '14:00',
            arriveTime: '16:30',
            affectedOrderId: 'ORD-2026-BRAHMAVAR-20-PUMP',
            affectedCustomer: 'Brahmavar Agro #3'
          }
        ]
      }
    ],
    optionComparisons: [
      {
        strategy: 'wait',
        label: 'Partial Dispatch + Delay 5 Pumps',
        affectedOrders: ['ORD-2026-BRAHMAVAR-20-PUMP'],
        freightCostInr: 2800,
        slaPenaltyInr: 4500,
        orderRevenueInr: 142000,
        remainingMarginInr: 19700,
        marginDeltaLabel: 'Only feasible fallback',
        feasible: false
      }
    ],
    historicalCases: {
      originalQuery: '20 agricultural water pumps short 5 units for Brahmavar irrigation deadline',
      steeredQueryTemplate: 'Submersible pump shortage escalation and supplier batch PO',
      points: [
        {
          caseId: 'CASE-2024-212',
          title: 'Dec 2024 Brahmavar Pump Split Delay',
          x: 32,
          y: 41,
          baseSimilarity: 0.89,
          steeredSimilarity: 0.94,
          outcome: 'Issued unavoidable delay for 5 pumps and raised batch PO.',
          sku: 'PMP-SUB-05-AGR',
          evidenceRef: 'LOG-2024-212-EV',
          roleBriefings: {
            planner: 'Record unavoidable delay immediately and preserve audit trail.',
            warehouse: 'Dispatch 15 units from Mangalore Bay 4.',
            purchasing: 'Issue PO for 5 units from coastal supplier.'
          }
        }
      ]
    },
    purchasing: {
      shortageId: 'SHRT-BRH-PUMP-05',
      sku: 'PMP-SUB-05-AGR',
      itemName: '0.5 HP Submersible Agricultural Water Pump',
      shortageUnits: 5,
      batchCode: 'BATCH-26-11-PMP',
      supplierName: 'Varahi Agro Pumps & Motors',
      supplierEmail: 'orders@varahiagro.in',
      supplierEta: '2026-11-29 10:30',
      unitPriceInr: 5400,
      totalPriceInr: 27000,
      evidenceCitation: 'Mangalore stock ledger 15/20 + Customer insisted_original'
    }
  }
};
