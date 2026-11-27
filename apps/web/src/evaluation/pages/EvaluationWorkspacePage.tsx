import React, { useState, useEffect } from 'react';
import {
  CounterbalancedSession,
  EvalCaseId,
  InterfaceType,
  TrialSubmission
} from '../types/evaluation.ts';
import { getEvaluationAdapter } from '../adapters/evaluationAdapter.ts';
import { ParticipantInstructionsCard } from '../components/ParticipantInstructionsCard.tsx';
import { TextBaselinePlanner } from '../components/TextBaselinePlanner.tsx';
import { PostTrialCaptureDialog } from '../components/PostTrialCaptureDialog.tsx';
import { StudyResultsSummaryPanel } from '../components/StudyResultsSummaryPanel.tsx';
import { JudgeWalkthroughPanel } from '../components/JudgeWalkthroughPanel.tsx';
import { GodownRouteMap } from '../../planner/components/GodownRouteMap.tsx';
import { CutoffChallengePanel } from '../../planner/components/CutoffChallengePanel.tsx';
import { OptionComparisonTable } from '../../planner/components/OptionComparisonTable.tsx';
import { getPlannerAdapter } from '../../planner/adapters/plannerAdapter.ts';
import { PlannerOrder, CutoffPreviewResult } from '../../planner/types/planner.ts';
import { RotateCcwIcon } from '../../shared/icons.tsx';

interface ActiveTrialState {
  caseId: EvalCaseId;
  interfaceType: InterfaceType;
  startTimestamp: number;
}

export const EvaluationWorkspacePage: React.FC = () => {
  const adapter = getEvaluationAdapter();
  const [session, setSession] = useState<CounterbalancedSession | null>(null);
  const [activeTrial, setActiveTrial] = useState<ActiveTrialState | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [submissions, setSubmissions] = useState<TrialSubmission[]>(() => adapter.listSubmissions());

  // Interactive planner mock order state for interactive condition
  const [interactiveOrder, setInteractiveOrder] = useState<PlannerOrder | null>(null);
  const [cutoffPreview, setCutoffPreview] = useState<CutoffPreviewResult | null>(null);
  const [testedCutoffForInteractive, setTestedCutoffForInteractive] = useState<string>('16:00');

  // Dialog state
  const [showCaptureDialog, setShowCaptureDialog] = useState<boolean>(false);
  const [pendingSelection, setPendingSelection] = useState<{
    candidateId: string;
    cutoff: string;
  } | null>(null);

  // Timer loop for active trial
  useEffect(() => {
    if (!activeTrial) {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now();
      setElapsedSeconds(Math.floor((now - activeTrial.startTimestamp) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTrial]);

  const handleBeginTrial = async (caseId: EvalCaseId, interfaceType: InterfaceType) => {
    adapter.startTrial(caseId, session?.participantId || 'ANON', interfaceType);
    setActiveTrial({
      caseId,
      interfaceType,
      startTimestamp: Date.now()
    });
    setElapsedSeconds(0);
    setCutoffPreview(null);

    // If interactive condition, load the corresponding planner order
    if (interfaceType === 'interactive') {
      try {
        const pAdapter = getPlannerAdapter();
        const orderId = caseId === 'EVAL-CASE-A' ? 'ORD-2026-MANIPAL-50' : 'ORD-2026-BRAHMAVAR-20-PUMP';
        const o = await pAdapter.getOrder(orderId);
        setInteractiveOrder(o);
        setTestedCutoffForInteractive('16:00');
      } catch {
        // Fallback handled gracefully
      }
    }
  };

  const handleCancelTrial = () => {
    if (activeTrial) {
      adapter.resetEvaluationCase(activeTrial.caseId);
      setActiveTrial(null);
      setShowCaptureDialog(false);
      setPendingSelection(null);
    }
  };

  const handleTextDecision = (candidateId: string, testedCutoff: string) => {
    setPendingSelection({ candidateId, cutoff: testedCutoff });
    setShowCaptureDialog(true);
  };

  const handleInteractiveCutoffPreview = async (cutoffTime: string) => {
    if (!interactiveOrder) return;
    setTestedCutoffForInteractive(cutoffTime);
    try {
      const pAdapter = getPlannerAdapter();
      const prev = await pAdapter.previewCutoffImpact(
        interactiveOrder.orderId,
        interactiveOrder.selectedCandidateId,
        cutoffTime
      );
      setCutoffPreview(prev);
    } catch {
      // Ignore
    }
  };

  const handleInteractiveSelectCandidate = async (candidateId: string) => {
    if (!interactiveOrder) return;
    try {
      const pAdapter = getPlannerAdapter();
      const updated = await pAdapter.selectCandidate(interactiveOrder.orderId, candidateId);
      setInteractiveOrder(updated);
      setCutoffPreview(null);
    } catch {
      // Ignore
    }
  };

  const handleConfirmInteractiveDecision = () => {
    if (!interactiveOrder) return;
    setPendingSelection({
      candidateId: interactiveOrder.selectedCandidateId,
      cutoff: testedCutoffForInteractive
    });
    setShowCaptureDialog(true);
  };

  const handleSubmissionComplete = () => {
    setShowCaptureDialog(false);
    setActiveTrial(null);
    setPendingSelection(null);
    setSubmissions(adapter.listSubmissions());

    if (session) {
      setSession(adapter.getOrCreateSession(session.participantId));
    }
  };

  const handleResetEntireStudy = () => {
    adapter.resetAllEvaluationData();
    setSession(null);
    setActiveTrial(null);
    setShowCaptureDialog(false);
    setPendingSelection(null);
    setSubmissions([]);
  };

  const currentEvalCase = activeTrial ? adapter.getEvaluationCase(activeTrial.caseId) : null;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--rule)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            SETUVYUHA · PROBLEM STATEMENT 3 (PS3) EVALUATION
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.1 }}>
            Spatial Tower vs Baseline Evaluation
          </h1>
          <p style={{ color: 'var(--ink-secondary)', marginTop: '0.35rem' }}>
            Empirical within-subjects evaluation comparing interactive Godown route visualization against text-only baseline logs.
          </p>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={handleResetEntireStudy}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
        >
          <RotateCcwIcon size={14} />
          <span>Reset All Evaluation Data</span>
        </button>
      </div>

      {/* Judge Walkthrough Script */}
      <JudgeWalkthroughPanel />

      {/* Participant Protocol & Counterbalanced Session Controller */}
      {!activeTrial && (
        <ParticipantInstructionsCard
          currentSession={session}
          onSessionReady={s => setSession(s)}
          onBeginTrial={handleBeginTrial}
        />
      )}

      {/* Active Trial Canvas */}
      {activeTrial && currentEvalCase && (
        <div style={{ marginBottom: '2rem' }}>
          {/* Active Trial Status Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.25rem', background: 'var(--ink)', color: 'var(--surface)', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: 'var(--oxide-red)', padding: '0.2rem 0.5rem', color: '#fff', fontWeight: 700 }}>
                ACTIVE TRIAL
              </span>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{currentEvalCase.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', opacity: 0.8 }}>
                Condition: {activeTrial.interfaceType === 'interactive' ? 'INTERACTIVE GODOWN MAP' : 'TEXT-ONLY BASELINE'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700 }}>
                ⏱ {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
              </div>
              <button
                type="button"
                onClick={handleCancelTrial}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '0.3rem 0.65rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
              >
                Abort &amp; Reset Case
              </button>
            </div>
          </div>

          {/* Condition Rendering */}
          {activeTrial.interfaceType === 'text_baseline' ? (
            <TextBaselinePlanner
              evaluationCase={currentEvalCase}
              onSelectCandidate={handleTextDecision}
            />
          ) : (
            <div>
              {/* Interactive Condition using visual Godown route map & cutoff challenge */}
              <div style={{ padding: '0.75rem 1rem', background: 'var(--forest-green-subtle)', borderLeft: '4px solid var(--forest-green)', borderTop: '1px solid var(--rule)', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', marginBottom: '1.25rem' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--forest-green)', fontWeight: 700, marginBottom: '0.2rem' }}>
                  INTERFACE 2 OF 2 · INTERACTIVE GODOWN TOWER
                </p>
                <p style={{ fontSize: '0.86rem', color: 'var(--ink)' }}>
                  Inspect the spatial topology of hubs, customer locations, animated transit legs, and simulate cutoff times with live dual-customer outcomes.
                </p>
              </div>

              {interactiveOrder && (
                <>
                  <GodownRouteMap
                    order={interactiveOrder}
                    onSelectCandidate={handleInteractiveSelectCandidate}
                  />
                  <CutoffChallengePanel
                    order={interactiveOrder}
                    preview={cutoffPreview}
                    onPreviewCutoff={handleInteractiveCutoffPreview}
                    isPreviewing={false}
                  />
                  <OptionComparisonTable
                    order={interactiveOrder}
                    onSelectCandidate={handleInteractiveSelectCandidate}
                  />

                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', padding: '1rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleConfirmInteractiveDecision}
                      style={{ padding: '0.65rem 1.6rem', fontSize: '0.95rem' }}
                    >
                      Confirm Recovery Decision with {interactiveOrder.selectedCandidateId}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Post-Trial Feedback Modal */}
      {showCaptureDialog && activeTrial && pendingSelection && (
        <PostTrialCaptureDialog
          participantId={session?.participantId || 'ANON'}
          caseId={activeTrial.caseId}
          interfaceType={activeTrial.interfaceType}
          selectedCandidateId={pendingSelection.candidateId}
          testedCutoff={pendingSelection.cutoff}
          elapsedSeconds={elapsedSeconds}
          onSubmitted={handleSubmissionComplete}
          onCancel={() => setShowCaptureDialog(false)}
        />
      )}

      {/* P4 Study Results Summary */}
      <StudyResultsSummaryPanel
        submissions={submissions}
        onResetStudy={handleResetEntireStudy}
      />
    </div>
  );
};
