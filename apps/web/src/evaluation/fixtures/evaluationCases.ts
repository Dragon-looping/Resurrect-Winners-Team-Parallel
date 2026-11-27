import { EvaluationCase } from '../types/evaluation.ts';

export const EVALUATION_CASES: Record<'EVAL-CASE-A' | 'EVAL-CASE-B', EvaluationCase> = {
  'EVAL-CASE-A': {
    caseId: 'EVAL-CASE-A',
    name: 'Case A: Coastal Corridor Fan Recovery (Manipal & Kundapura)',
    narrative:
      'Manipal Commercial Center (Shop #14) requested 50 industrial fans for a critical exhibition arriving Friday 17:00. Udupi warehouse manager audited physical inventory and discovered only 40 intact units (10 unit deficit). Udupi dispatch cutoff is normally 16:30. A buffer order is reserved for Kundapura Hardware (#7, 30 fans) with arrival deadline Monday 10:00.',
    primaryCustomer: {
      orderId: 'ORD-2026-MANIPAL-50',
      customerName: 'Manipal Commercial Center (Shop #14)',
      destination: 'Manipal Commercial Center, Shop #14',
      sku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      orderedUnits: 50,
      agreedDeadline: 'Friday, Nov 27 · 17:00',
      originalCutoff: '16:30'
    },
    shortageUnits: 10,
    physicalCountReported: 40,
    donorCustomer: {
      orderId: 'ORD-2026-KUNDAPURA-30',
      customerName: 'Kundapura Retail Depot (Shop #7)',
      destination: 'Kundapura Central Market, Depot #7',
      sku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      orderedUnits: 30,
      agreedDeadline: 'Monday, Nov 30 · 10:00',
      originalCutoff: 'Sunday 18:00'
    },
    candidates: [
      {
        candidateId: 'CAND-A-SWAP',
        strategy: 'swap',
        title: 'Option 1: Mangalore Buffer Inter-Order Swap',
        description:
          'Reallocate 10 fans from Mangalore Buffer depot (originally reserved for Kundapura #7) via coastal shuttle. Requires truck cutoff >= 16:00. Arrives Manipal Friday 16:45 (on-time). Kundapura is replenished by incoming central stock by Monday 08:30 (on-time).',
        sourceHub: 'Mangalore Buffer Hub',
        requiredCutoff: '16:00',
        freightCostInr: 3400,
        slaPenaltyInr: 0,
        remainingMarginInr: 42500,
        feasible: true,
        primaryOutcome: {
          orderId: 'ORD-2026-MANIPAL-50',
          customerName: 'Manipal Retail (#14)',
          projectedArrival: 'Friday 16:45',
          onTime: true,
          delayMinutes: 0
        },
        donorOutcome: {
          orderId: 'ORD-2026-KUNDAPURA-30',
          customerName: 'Kundapura Retail (#7)',
          projectedArrival: 'Monday 08:30',
          onTime: true,
          delayMinutes: 0
        }
      },
      {
        candidateId: 'CAND-A-SPARE',
        strategy: 'spare_sourcing',
        title: 'Option 2: Hassan Express Spare Van',
        description:
          'Dispatch hot-shot express van with 10 spare fans directly from Hassan Express Depot. Arrives Manipal Friday 16:15 (on-time). Kundapura untouched. High freight cost reduces order margin drastically.',
        sourceHub: 'Hassan Express Depot',
        requiredCutoff: '14:00',
        freightCostInr: 8200,
        slaPenaltyInr: 0,
        remainingMarginInr: 16800,
        feasible: true,
        primaryOutcome: {
          orderId: 'ORD-2026-MANIPAL-50',
          customerName: 'Manipal Retail (#14)',
          projectedArrival: 'Friday 16:15',
          onTime: true,
          delayMinutes: 0
        },
        donorOutcome: {
          orderId: 'ORD-2026-KUNDAPURA-30',
          customerName: 'Kundapura Retail (#7)',
          projectedArrival: 'Monday 08:00',
          onTime: true,
          delayMinutes: 0
        }
      },
      {
        candidateId: 'CAND-A-WAIT',
        strategy: 'wait',
        title: 'Option 3: Wait for Central Udupi Replenishment',
        description:
          'Hold dispatch until Saturday regular batch replenishment arrives at Udupi. Violates Manipal exhibition deadline by 48 hours.',
        sourceHub: 'Udupi Central Plant',
        requiredCutoff: '16:30',
        freightCostInr: 1200,
        slaPenaltyInr: 18500,
        remainingMarginInr: -4200,
        feasible: false,
        infeasibilityReason: 'Misses agreed Friday 17:00 deadline by 48 hours. Incurs severe SLA penalty.',
        primaryOutcome: {
          orderId: 'ORD-2026-MANIPAL-50',
          customerName: 'Manipal Retail (#14)',
          projectedArrival: 'Sunday 17:00',
          onTime: false,
          delayMinutes: 2880
        },
        donorOutcome: {
          orderId: 'ORD-2026-KUNDAPURA-30',
          customerName: 'Kundapura Retail (#7)',
          projectedArrival: 'Monday 08:00',
          onTime: true,
          delayMinutes: 0
        }
      }
    ],
    answerKey: {
      caseId: 'EVAL-CASE-A',
      optimalCandidateId: 'CAND-A-SWAP',
      acceptableCandidateId: 'CAND-A-SPARE',
      infeasibleCandidateId: 'CAND-A-WAIT',
      minimumSafeCutoff: '16:00',
      donorRiskThresholdCutoff: '16:00',
      bothCustomersSatisfied: true,
      rationale: {
        optimal:
          'Option 1 (Swap) satisfies both Manipal (Fri 16:45) and Kundapura (Mon 08:30) on-time while maintaining high remaining margin (₹42,500), provided cutoff is kept >= 16:00.',
        acceptable:
          'Option 2 (Spare Van) arrives on time and protects both customers but costs ₹8,200 freight, reducing margin to ₹16,800.',
        infeasible:
          'Option 3 (Wait) breaches Friday SLA by 48 hours, causing ₹18,500 SLA penalty and negative margin.'
      }
    }
  },

  'EVAL-CASE-B': {
    caseId: 'EVAL-CASE-B',
    name: 'Case B: Agricultural Pump Emergency (Brahmavar & Surathkal)',
    narrative:
      'Brahmavar Agro-Services (#3) requested 20 submersible water pumps for farm irrigation arriving Saturday 14:00. Udupi godown physical count verified only 14 available units (6 unit deficit). Normal dispatch cutoff is Saturday 14:00. Donor order is reserved for Surathkal Hardware (#2, 25 pumps) with arrival deadline Tuesday 11:00.',
    primaryCustomer: {
      orderId: 'ORD-2026-BRAHMAVAR-20',
      customerName: 'Brahmavar Agro Services (#3)',
      destination: 'Brahmavar APMC Market, Agro #3',
      sku: 'PUMP-SUB-05-AG',
      itemName: '0.5 HP Submersible Agricultural Water Pumps',
      orderedUnits: 20,
      agreedDeadline: 'Saturday, Nov 28 · 14:00',
      originalCutoff: '14:00'
    },
    shortageUnits: 6,
    physicalCountReported: 14,
    donorCustomer: {
      orderId: 'ORD-2026-SURATHKAL-25',
      customerName: 'Surathkal Agro-Hardware (#2)',
      destination: 'Surathkal Main Road, Shop #2',
      sku: 'PUMP-SUB-05-AG',
      itemName: '0.5 HP Submersible Agricultural Water Pumps',
      orderedUnits: 25,
      agreedDeadline: 'Tuesday, Dec 01 · 11:00',
      originalCutoff: 'Monday 16:00'
    },
    candidates: [
      {
        candidateId: 'CAND-B-SWAP',
        strategy: 'swap',
        title: 'Option 1: Mangalore Depot Pump Transfer',
        description:
          'Reallocate 6 pumps from Mangalore Depot buffer (tagged for Surathkal #2) via coastal route. Requires truck cutoff >= 13:30. Arrives Brahmavar Saturday 13:15 (on-time). Surathkal replenished Monday 15:00 (well ahead of Tuesday 11:00 deadline).',
        sourceHub: 'Mangalore Buffer Hub',
        requiredCutoff: '13:30',
        freightCostInr: 4100,
        slaPenaltyInr: 0,
        remainingMarginInr: 38200,
        feasible: true,
        primaryOutcome: {
          orderId: 'ORD-2026-BRAHMAVAR-20',
          customerName: 'Brahmavar Agro (#3)',
          projectedArrival: 'Saturday 13:15',
          onTime: true,
          delayMinutes: 0
        },
        donorOutcome: {
          orderId: 'ORD-2026-SURATHKAL-25',
          customerName: 'Surathkal Agro (#2)',
          projectedArrival: 'Monday 15:00',
          onTime: true,
          delayMinutes: 0
        }
      },
      {
        candidateId: 'CAND-B-SPARE',
        strategy: 'spare_sourcing',
        title: 'Option 2: Hassan Spare Dispatch',
        description:
          'Charter direct express courier with 6 reserve pumps from Hassan. Arrives Brahmavar Saturday 13:40 (on-time). Surathkal untouched. Heavy freight charge.',
        sourceHub: 'Hassan Express Depot',
        requiredCutoff: '11:30',
        freightCostInr: 9500,
        slaPenaltyInr: 0,
        remainingMarginInr: 14900,
        feasible: true,
        primaryOutcome: {
          orderId: 'ORD-2026-BRAHMAVAR-20',
          customerName: 'Brahmavar Agro (#3)',
          projectedArrival: 'Saturday 13:40',
          onTime: true,
          delayMinutes: 0
        },
        donorOutcome: {
          orderId: 'ORD-2026-SURATHKAL-25',
          customerName: 'Surathkal Agro (#2)',
          projectedArrival: 'Tuesday 09:00',
          onTime: true,
          delayMinutes: 0
        }
      },
      {
        candidateId: 'CAND-B-WAIT',
        strategy: 'wait',
        title: 'Option 3: Await Central Supplier Delivery',
        description:
          'Wait for delayed central supplier shipment to reach Udupi on Monday afternoon. Fails Saturday irrigation SLA.',
        sourceHub: 'Udupi Central Plant',
        requiredCutoff: '14:00',
        freightCostInr: 1500,
        slaPenaltyInr: 16000,
        remainingMarginInr: -5200,
        feasible: false,
        infeasibilityReason: 'Misses agreed Saturday 14:00 deadline by 48 hours. Incurs farmer harvest loss penalty.',
        primaryOutcome: {
          orderId: 'ORD-2026-BRAHMAVAR-20',
          customerName: 'Brahmavar Agro (#3)',
          projectedArrival: 'Monday 14:00',
          onTime: false,
          delayMinutes: 2880
        },
        donorOutcome: {
          orderId: 'ORD-2026-SURATHKAL-25',
          customerName: 'Surathkal Agro (#2)',
          projectedArrival: 'Tuesday 09:00',
          onTime: true,
          delayMinutes: 0
        }
      }
    ],
    answerKey: {
      caseId: 'EVAL-CASE-B',
      optimalCandidateId: 'CAND-B-SWAP',
      acceptableCandidateId: 'CAND-B-SPARE',
      infeasibleCandidateId: 'CAND-B-WAIT',
      minimumSafeCutoff: '13:30',
      donorRiskThresholdCutoff: '13:30',
      bothCustomersSatisfied: true,
      rationale: {
        optimal:
          'Option 1 (Swap) delivers pumps to Brahmavar on Saturday 13:15 and safely replenishes Surathkal on Monday 15:00 ahead of Tuesday deadline, with remaining margin of ₹38,200.',
        acceptable:
          'Option 2 (Spare) satisfies deadlines without affecting Surathkal, but high courier freight (₹9,500) lowers margin to ₹14,900.',
        infeasible:
          'Option 3 (Wait) misses Saturday deadline by 48 hours, incurring heavy penalty.'
      }
    }
  }
};
