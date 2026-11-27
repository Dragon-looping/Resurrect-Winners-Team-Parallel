import type {
  CounterbalancedSession,
  EvalCaseId,
  EvaluationCase,
  InterfaceType,
  TrialSubmission
} from '../types/evaluation.ts';
import { EVALUATION_CASES } from '../fixtures/evaluationCases.ts';

const EVAL_STORAGE_KEY = 'setuvyuha_ps3_evaluation_v1';
const EVAL_ACTIVE_TRIAL_KEY = 'setuvyuha_ps3_active_trial_v1';

interface EvalStorageState {
  submissions: TrialSubmission[];
  activeSessions: Record<string, CounterbalancedSession>;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

let inMemoryStorage: EvalStorageState | null = null;

function getStore(): EvalStorageState {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(EVAL_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // Ignore storage issues in headless test runners
  }
  if (inMemoryStorage) return inMemoryStorage;
  const initial: EvalStorageState = {
    submissions: [],
    activeSessions: {}
  };
  saveStore(initial);
  return initial;
}

function saveStore(state: EvalStorageState) {
  inMemoryStorage = state;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(EVAL_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Ignore storage issues
  }
}

export class EvaluationAdapter {
  getEvaluationCase(caseId: EvalCaseId): EvaluationCase {
    const found = EVALUATION_CASES[caseId];
    if (!found) {
      throw new Error(`Evaluation case not found: ${caseId}`);
    }
    return JSON.parse(JSON.stringify(found));
  }

  listEvaluationCases(): EvaluationCase[] {
    return Object.values(EVALUATION_CASES).map(c => JSON.parse(JSON.stringify(c)));
  }

  /**
   * Start a trial cleanly.
   * Generates a trialId and records start timestamp in isolated storage.
   */
  startTrial(caseId: EvalCaseId, participantId: string, interfaceType: InterfaceType): {
    trialId: string;
    startedAt: string;
  } {
    const startedAt = new Date().toISOString();
    const trialId = `TRL-${caseId.slice(-1)}-${participantId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-6)}`;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(
          EVAL_ACTIVE_TRIAL_KEY,
          JSON.stringify({ trialId, caseId, participantId, interfaceType, startedAt })
        );
      }
    } catch {
      // Ignore
    }
    return { trialId, startedAt };
  }

  /**
   * Repeatably reset a specific evaluation case without touching customer or planner storage.
   */
  resetEvaluationCase(caseId: EvalCaseId): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem(EVAL_ACTIVE_TRIAL_KEY);
        if (raw) {
          const active = JSON.parse(raw);
          if (active.caseId === caseId) {
            sessionStorage.removeItem(EVAL_ACTIVE_TRIAL_KEY);
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Clear all evaluation trials and participant results while leaving live and customer orders intact.
   */
  resetAllEvaluationData(): void {
    const cleared: EvalStorageState = {
      submissions: [],
      activeSessions: {}
    };
    saveStore(cleared);
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(EVAL_ACTIVE_TRIAL_KEY);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Evaluate a trial decision against the ground-truth answer key.
   */
  evaluateDecision(
    caseId: EvalCaseId,
    selectedCandidateId: string,
    testedCutoff: string
  ): {
    isOptimal: boolean;
    isAcceptable: boolean;
    brokeDonor: boolean;
    rationale: string;
  } {
    const evalCase = this.getEvaluationCase(caseId);
    const key = evalCase.answerKey;

    const testedMins = parseMinutes(testedCutoff);
    const safeCutoffMins = parseMinutes(key.minimumSafeCutoff);
    const isCutoffSafe = testedMins >= safeCutoffMins;

    const isOptimal = selectedCandidateId === key.optimalCandidateId && isCutoffSafe;
    const isAcceptable = selectedCandidateId === key.acceptableCandidateId;

    // Swap candidate with unsafe cutoff breaks donor replenishment
    const brokeDonor =
      selectedCandidateId === key.optimalCandidateId && !isCutoffSafe;

    let rationale = key.rationale.infeasible;
    if (isOptimal) {
      rationale = key.rationale.optimal;
    } else if (isAcceptable) {
      rationale = key.rationale.acceptable;
    } else if (brokeDonor) {
      rationale = `Unsafe cutoff ${testedCutoff} is earlier than ${key.minimumSafeCutoff}, breaking donor promise.`;
    }

    return {
      isOptimal,
      isAcceptable,
      brokeDonor,
      rationale
    };
  }

  /**
   * Submit an anonymous trial result.
   */
  submitTrial(submission: TrialSubmission): void {
    const store = getStore();
    store.submissions.push(submission);

    // Update active session progress
    const session = store.activeSessions[submission.participantId];
    if (session) {
      if (session.trial1.caseId === submission.caseId) {
        session.trial1.completed = true;
      } else if (session.trial2.caseId === submission.caseId) {
        session.trial2.completed = true;
      }
    }

    saveStore(store);

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(EVAL_ACTIVE_TRIAL_KEY);
      }
    } catch {
      // Ignore
    }
  }

  listSubmissions(): TrialSubmission[] {
    return getStore().submissions;
  }

  /**
   * Assign counterbalanced participant session (Latin Square ABBA order).
   */
  getOrCreateSession(participantId: string): CounterbalancedSession {
    const store = getStore();
    if (store.activeSessions[participantId]) {
      return store.activeSessions[participantId];
    }

    // Alternate group based on participant count
    const existingCount = Object.keys(store.activeSessions).length;
    const isEven = existingCount % 2 === 0;

    const session: CounterbalancedSession = isEven
      ? {
          participantId,
          group: 'A_FIRST',
          trial1: {
            caseId: 'EVAL-CASE-A',
            interfaceType: 'interactive',
            completed: false
          },
          trial2: {
            caseId: 'EVAL-CASE-B',
            interfaceType: 'text_baseline',
            completed: false
          }
        }
      : {
          participantId,
          group: 'B_FIRST',
          trial1: {
            caseId: 'EVAL-CASE-B',
            interfaceType: 'text_baseline',
            completed: false
          },
          trial2: {
            caseId: 'EVAL-CASE-A',
            interfaceType: 'interactive',
            completed: false
          }
        };

    store.activeSessions[participantId] = session;
    saveStore(store);
    return session;
  }
}

// Singleton helper
let defaultEvaluationAdapter: EvaluationAdapter | null = null;

export function getEvaluationAdapter(): EvaluationAdapter {
  if (!defaultEvaluationAdapter) {
    defaultEvaluationAdapter = new EvaluationAdapter();
  }
  return defaultEvaluationAdapter;
}

export function resetEvaluationStore(): void {
  getEvaluationAdapter().resetAllEvaluationData();
}
