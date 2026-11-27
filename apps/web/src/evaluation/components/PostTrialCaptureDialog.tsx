import React, { useState } from 'react';
import { EvalCaseId, InterfaceType, TrialSubmission } from '../types/evaluation.ts';
import { getEvaluationAdapter } from '../adapters/evaluationAdapter.ts';
import { CheckIcon, AlertIcon } from '../../shared/icons.tsx';

interface PostTrialCaptureDialogProps {
  participantId: string;
  caseId: EvalCaseId;
  interfaceType: InterfaceType;
  selectedCandidateId: string;
  testedCutoff: string;
  elapsedSeconds: number;
  onSubmitted: (submission: TrialSubmission) => void;
  onCancel: () => void;
}

export const PostTrialCaptureDialog: React.FC<PostTrialCaptureDialogProps> = ({
  participantId,
  caseId,
  interfaceType,
  selectedCandidateId,
  testedCutoff,
  elapsedSeconds,
  onSubmitted,
  onCancel
}) => {
  const [controlScore, setControlScore] = useState<number>(4);
  const [clarityScore, setClarityScore] = useState<number>(4);
  const [confidenceScore, setConfidenceScore] = useState<number>(4);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const adapter = getEvaluationAdapter();
  const evaluationResult = adapter.evaluateDecision(caseId, selectedCandidateId, testedCutoff);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const now = new Date().toISOString();
    const submission: TrialSubmission = {
      trialId: `TRL-${Date.now().toString().slice(-6)}`,
      participantId,
      caseId,
      interfaceType,
      startedAt: new Date(Date.now() - elapsedSeconds * 1000).toISOString(),
      completedAt: now,
      elapsedSeconds,
      selectedCandidateId,
      testedCutoff,
      isCorrectOptimal: evaluationResult.isOptimal,
      isAcceptable: evaluationResult.isAcceptable,
      brokeDonorPromise: evaluationResult.brokeDonor,
      perceivedControlScore: controlScore,
      easeOfUnderstandingScore: clarityScore,
      confidenceScore,
      participantNotes: notes.trim() || undefined
    };

    adapter.submitTrial(submission);
    onSubmitted(submission);
  };

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeFormatted = `${minutes}m ${seconds}s`;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 9999
      }}
    >
      <div
        className="ruled-box"
        style={{
          background: 'var(--surface)',
          maxWidth: '620px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '1.75rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
        }}
      >
        <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
            TRIAL RECORDING · ANONYMOUS TRIAL SUBMISSION
          </p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Trial Results &amp; Feedback
          </h2>
        </div>

        {/* Objective metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ padding: '0.65rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Elapsed Time</span>
            <p className="tabular" style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.2rem' }}>{timeFormatted}</p>
          </div>
          <div style={{ padding: '0.65rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Selected Plan</span>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.2rem' }}>{selectedCandidateId}</p>
          </div>
          <div style={{ padding: '0.65rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Cutoff Tested</span>
            <p className="tabular" style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.2rem' }}>{testedCutoff}</p>
          </div>
        </div>

        {/* Evaluated outcome banner */}
        <div
          style={{
            padding: '0.85rem 1rem',
            background: evaluationResult.isOptimal
              ? 'var(--forest-green-subtle)'
              : evaluationResult.brokeDonor
              ? 'var(--oxide-red-subtle)'
              : 'var(--surface-subtle)',
            border: `1px solid ${
              evaluationResult.isOptimal
                ? 'var(--forest-green)'
                : evaluationResult.brokeDonor
                ? 'var(--oxide-red)'
                : 'var(--rule)'
            }`,
            marginBottom: '1.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {evaluationResult.isOptimal ? (
              <CheckIcon size={18} color="var(--forest-green)" />
            ) : (
              <AlertIcon size={18} color={evaluationResult.brokeDonor ? 'var(--oxide-red)' : 'var(--ink)'} />
            )}
            <strong
              style={{
                fontSize: '0.9rem',
                color: evaluationResult.isOptimal
                  ? 'var(--forest-green)'
                  : evaluationResult.brokeDonor
                  ? 'var(--oxide-red)'
                  : 'var(--ink)'
              }}
            >
              {evaluationResult.isOptimal
                ? 'OPTIMAL DECISION: Both customer SLAs satisfied + high margin'
                : evaluationResult.brokeDonor
                ? 'BROKEN DONOR PROMISE: Unsafe cutoff broke donor delivery'
                : 'SUB-OPTIMAL DECISION: Feasible but lower margin / excess delay'}
            </strong>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink)', lineHeight: 1.45 }}>
            {evaluationResult.rationale}
          </p>
        </div>

        {/* Likert Questionnaire */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              1. Perceived Control (1–5)
              <span style={{ display: 'block', fontWeight: 400, fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                "I felt fully in control of the trade-offs, cutoff rules, and dual customer outcomes."
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[1, 2, 3, 4, 5].map(val => (
                <button
                  type="button"
                  key={val}
                  onClick={() => setControlScore(val)}
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    background: controlScore === val ? 'var(--oxide-red)' : 'var(--surface-subtle)',
                    color: controlScore === val ? 'var(--surface)' : 'var(--ink)',
                    border: '1px solid var(--rule)'
                  }}
                >
                  {val}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--ink-muted)', marginTop: '0.2rem' }}>
              <span>1 = No control</span>
              <span>5 = Full control</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              2. Ease of Understanding &amp; Clarity (1–5)
              <span style={{ display: 'block', fontWeight: 400, fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                "The impact of cutoff changes on both orders was immediately clear."
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[1, 2, 3, 4, 5].map(val => (
                <button
                  type="button"
                  key={val}
                  onClick={() => setClarityScore(val)}
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    background: clarityScore === val ? 'var(--oxide-red)' : 'var(--surface-subtle)',
                    color: clarityScore === val ? 'var(--surface)' : 'var(--ink)',
                    border: '1px solid var(--rule)'
                  }}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              3. Decision Confidence (1–5)
              <span style={{ display: 'block', fontWeight: 400, fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                "How confident are you that your decision was the right one?"
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[1, 2, 3, 4, 5].map(val => (
                <button
                  type="button"
                  key={val}
                  onClick={() => setConfidenceScore(val)}
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    background: confidenceScore === val ? 'var(--oxide-red)' : 'var(--surface-subtle)',
                    color: confidenceScore === val ? 'var(--surface)' : 'var(--ink)',
                    border: '1px solid var(--rule)'
                  }}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Optional Qualitative Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What made this scenario easy or difficult?"
              rows={2}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--rule)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSubmitting}>
              Back to Inspection
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Recording...' : 'Submit Trial Results'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
