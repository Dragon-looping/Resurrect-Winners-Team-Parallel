export type PlannerAdapterMode = 'fixture' | 'live';

export type PlannerOrderRisk = 'on_track' | 'at_risk' | 'critical_shortage' | 'unavoidable_delay' | 'resolved';

export type RecoveryStrategyType = 'swap' | 'spare_sourcing' | 'wait';

export interface TelemetrySnapshot {
  agreedArrival: string;
  projectedShip: string;
  projectedArrival: string;
  backlogUnits: number;
  stockOutRiskPercent: number;
  isFeedStale: boolean;
  feedLastUpdatedAt: string;
  staleReason?: string;
  dispatchCutoff: string; // HH:mm e.g. '16:00'
  streamConnected: boolean;
}

export interface PlannerOfferSummary {
  offerId: string;
  offerType: 'split' | 'later' | 'standard';
  shipments: Array<{
    shipmentId: string;
    quantity: number;
    arrivalDate: string;
    origin: string;
    destination: string;
  }>;
  customerResponse: 'pending' | 'accepted_split' | 'accepted_later' | 'insisted_original' | 'declined';
  permittedPlannerActions: Array<'approve_recovery' | 'issue_split' | 'issue_later' | 'record_delay' | 'hold_promise'>;
  originalPromisePreserved: boolean;
  notes: string;
}

export interface RouteLeg {
  legId: string;
  fromNodeId: string;
  toNodeId: string;
  fromLabel: string;
  toLabel: string;
  units: number;
  departTime: string;
  arriveTime: string;
  affectedOrderId: string;
  affectedCustomer: string;
}

export interface RecoveryCandidate {
  candidateId: string;
  strategy: RecoveryStrategyType;
  title: string;
  summary: string;
  sourcePlant: string;
  donorOrderId?: string;
  donorCustomer?: string;
  feasible: boolean;
  infeasibilityReason?: string;
  cutoffRequired: string; // e.g. '16:30'
  highlightedNodeIds: string[];
  routeLegs: RouteLeg[];
  affectedCustomerLabels: string[];
}

export interface CutoffOrderOutcome {
  orderId: string;
  customerLabel: string;
  destination: string;
  agreedArrival: string;
  projectedArrival: string;
  onTime: boolean;
  delayMinutes: number;
}

export interface CutoffPreviewResult {
  previewId: string;
  previewVersion: number;
  requestedCutoff: string;
  candidateId: string;
  feasible: boolean;
  unsafeReason?: string;
  outcomes: CutoffOrderOutcome[];
  isSavedPlanUnchanged: true;
  generatedAt: string;
}

export interface OptionComparisonRow {
  strategy: RecoveryStrategyType;
  label: string;
  affectedOrders: string[];
  freightCostInr: number;
  slaPenaltyInr: number;
  orderRevenueInr: number;
  remainingMarginInr: number;
  marginDeltaLabel: string;
  feasible: boolean;
}

export interface HistoricalCasePoint {
  caseId: string;
  title: string;
  x: number; // 0..100 for fixed 2D plot
  y: number; // 0..100 for fixed 2D plot
  baseSimilarity: number;
  steeredSimilarity: number;
  outcome: string;
  sku: string;
  evidenceRef: string;
  roleBriefings: {
    planner: string;
    warehouse: string;
    purchasing: string;
  };
}

export interface HistoricalCasePanelData {
  originalQuery: string;
  steeredQueryTemplate: string;
  points: HistoricalCasePoint[];
}

export interface PurchasingReviewItem {
  shortageId: string;
  sku: string;
  itemName: string;
  shortageUnits: number;
  batchCode: string;
  supplierName: string;
  supplierEmail: string;
  supplierEta: string;
  unitPriceInr: number;
  totalPriceInr: number;
  evidenceCitation: string;
  poReceipt?: {
    poNumber: string;
    approvedAt: string;
    approvedBy: string;
  };
  emailReceipt?: {
    messageId: string;
    sentTo: string;
    sentAt: string;
  };
}

export interface PlannerOrder {
  orderId: string;
  version: number;
  itemSku: string;
  itemName: string;
  quantity: number;
  unitLabel: string;
  destination: string;
  customerLabel: string;
  riskStatus: PlannerOrderRisk;
  telemetry: TelemetrySnapshot;
  offerSummary: PlannerOfferSummary;
  candidates: RecoveryCandidate[];
  selectedCandidateId: string;
  optionComparisons: OptionComparisonRow[];
  historicalCases: HistoricalCasePanelData;
  purchasing: PurchasingReviewItem;
  approvedCandidateId?: string;
  rejectionReason?: string;
  unavoidableDelayNote?: string;
}

export interface GodownNode {
  id: string;
  label: string;
  kind: 'plant' | 'depot' | 'customer';
  x: number;
  y: number;
  stockSummary?: string;
}

export interface PlannerIntakeRequest {
  itemSku: string;
  itemName?: string;
  quantity: number;
  destination: string;
  requestedArrival: string;
}

export interface PlannerConfig {
  mode: PlannerAdapterMode;
  apiBaseUrl: string;
}
