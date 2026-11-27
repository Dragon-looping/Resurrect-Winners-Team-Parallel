export type InterfaceType = 'interactive' | 'text_baseline';

export type EvalCaseId = 'EVAL-CASE-A' | 'EVAL-CASE-B';

export type EvaluationOptionStrategy = 'swap' | 'spare_sourcing' | 'wait';

export interface CustomerCommitment {
  orderId: string;
  customerName: string;
  destination: string;
  sku: string;
  itemName: string;
  orderedUnits: number;
  agreedDeadline: string;
  originalCutoff: string;
}

export interface CandidateOutcome {
  orderId: string;
  customerName: string;
  projectedArrival: string;
  onTime: boolean;
  delayMinutes: number;
}

export interface EvalCandidateOption {
  candidateId: string;
  strategy: EvaluationOptionStrategy;
  title: string;
  description: string;
  sourceHub: string;
  requiredCutoff: string; // e.g. "16:00"
  freightCostInr: number;
  slaPenaltyInr: number;
  remainingMarginInr: number;
  feasible: boolean;
  infeasibilityReason?: string;
  primaryOutcome: CandidateOutcome;
  donorOutcome?: CandidateOutcome;
}

export interface AnswerKey {
  caseId: EvalCaseId;
  optimalCandidateId: string;
  acceptableCandidateId: string;
  infeasibleCandidateId: string;
  minimumSafeCutoff: string;
  rationale: {
    optimal: string;
    acceptable: string;
    infeasible: string;
  };
  bothCustomersSatisfied: boolean;
  donorRiskThresholdCutoff: string;
}

export interface EvaluationCase {
  caseId: EvalCaseId;
  name: string;
  narrative: string;
  primaryCustomer: CustomerCommitment;
  shortageUnits: number;
  physicalCountReported: number;
  donorCustomer: CustomerCommitment;
  candidates: EvalCandidateOption[];
  answerKey: AnswerKey;
}

export interface TrialSubmission {
  trialId: string;
  participantId: string;
  caseId: EvalCaseId;
  interfaceType: InterfaceType;
  startedAt: string;
  completedAt: string;
  elapsedSeconds: number;
  selectedCandidateId: string;
  testedCutoff: string;
  isCorrectOptimal: boolean;
  isAcceptable: boolean;
  brokeDonorPromise: boolean;
  perceivedControlScore: number; // 1 to 5 Likert
  easeOfUnderstandingScore: number; // 1 to 5 Likert
  confidenceScore: number; // 1 to 5 Likert
  participantNotes?: string;
}

export interface CounterbalancedSession {
  participantId: string;
  group: 'A_FIRST' | 'B_FIRST';
  trial1: {
    caseId: EvalCaseId;
    interfaceType: InterfaceType;
    completed: boolean;
  };
  trial2: {
    caseId: EvalCaseId;
    interfaceType: InterfaceType;
    completed: boolean;
  };
}

export interface StudyResultsSummary {
  totalParticipants: number;
  completedSessions: number;
  interfaceOrderBreakdown: {
    interactiveFirstCount: number;
    textFirstCount: number;
  };
  metricsByInterface: {
    interactive: {
      averageElapsedSeconds: number;
      optimalDecisionRate: number;
      acceptableDecisionRate: number;
      brokenDonorPromiseRate: number;
      averagePerceivedControl: number;
    };
    text_baseline: {
      averageElapsedSeconds: number;
      optimalDecisionRate: number;
      acceptableDecisionRate: number;
      brokenDonorPromiseRate: number;
      averagePerceivedControl: number;
    };
  };
  failures: Array<{
    participantId: string;
    interfaceType: InterfaceType;
    caseId: EvalCaseId;
    failureReason: string;
  }>;
  practiceEffectAnalysis: {
    trial1Accuracy: number;
    trial2Accuracy: number;
    limitationNote: string;
  };
}
