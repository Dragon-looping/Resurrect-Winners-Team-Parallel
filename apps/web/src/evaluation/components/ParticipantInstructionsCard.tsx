import React, { useState } from 'react';
import { CounterbalancedSession, EvalCaseId, InterfaceType } from '../types/evaluation.ts';
import { getEvaluationAdapter } from '../adapters/evaluationAdapter.ts';

interface ParticipantInstructionsCardProps {
  currentSession: CounterbalancedSession | null;
  onSessionReady: (session: CounterbalancedSession) => void;
  onBeginTrial: (caseId: EvalCaseId, interfaceType: InterfaceType) => void;
}

export const ParticipantInstructionsCard: React.FC<ParticipantInstructionsCardProps> = ({
  currentSession,
  onSessionReady,
  onBeginTrial
}) => {
  const [participantInput, setParticipantInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    const pid = participantInput.trim() || `PARTICIPANT-${Math.floor(100 + Math.random() * 900)}`;
    try {
      const adapter = getEvaluationAdapter();
      const session = adapter.getOrCreateSession(pid);
      onSessionReady(session);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize session.');
    }
  };

  const handleQuickId = () => {
    const randomId = `P-${Math.floor(10 + Math.random() * 90)}`;
    setParticipantInput(randomId);
  };

  let activeTrial = null;
  if (currentSession) {
    if (!currentSession.trial1.completed) {
      activeTrial = currentSession.trial1;
    } else if (!currentSession.trial2.completed) {
      activeTrial = currentSession.trial2;
    }
  }

  return (
    <section className="ruled-box" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          PS3 USER EVALUATION · WITHIN-SUBJECTS EXPERIMENTAL PROTOCOL
        </p>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.15 }}>
          Logistics Planner Decision Experiment
        </h2>
        <p style={{ fontSize: '0.86rem', color: 'var(--ink-secondary)', marginTop: '0.35rem' }}>
          Evaluate spatial decision support (Interactive Godown Map) against a text-only baseline log for dual-customer inventory disruptions.
        </p>
      </div>

      {!currentSession ? (
        <div>
          <div style={{ background: 'var(--surface-subtle)', padding: '1rem', border: '1px solid var(--rule)', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem', fontFamily: 'var(--font-display)' }}>
              Participant Instructions &amp; Objectives
            </h3>
            <ul style={{ fontSize: '0.86rem', color: 'var(--ink)', paddingLeft: '1.25rem', lineHeight: 1.55 }}>
              <li>You will solve <strong>two distinct disruption scenarios</strong> caused by physical audit corrections at Udupi Godown.</li>
              <li>Your goal: <strong>Select a recovery candidate and verify truck cutoff</strong> so that <em>both</em> the primary buyer and any donor customers receive shipments on time.</li>
              <li>To eliminate ordering bias, the system uses <strong>Latin-square counterbalancing (AB / BA)</strong>: you will use the Interactive Tower for one case and the Text Baseline for the other.</li>
              <li>Your decisions, completion time, cutoff simulations, and post-trial ratings are recorded anonymously.</li>
            </ul>
          </div>

          <form onSubmit={handleStartSession} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-secondary)', marginBottom: '0.3rem' }}>
                Anonymous Participant ID
              </label>
              <input
                type="text"
                value={participantInput}
                onChange={e => setParticipantInput(e.target.value)}
                placeholder="e.g. P-01 or USER-42"
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>
            <button type="button" className="btn-secondary" onClick={handleQuickId} style={{ padding: '0.5rem 0.9rem' }}>
              Random ID
            </button>
            <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1.4rem' }}>
              Begin Evaluation Session
            </button>
          </form>

          {error && (
            <p style={{ marginTop: '0.75rem', color: 'var(--oxide-red)', fontSize: '0.84rem' }}>{error}</p>
          )}
        </div>
      ) : (
        <div>
          {/* Active session status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.85rem 1rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)', marginBottom: '1.25rem' }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Participant: </span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>{currentSession.participantId}</strong>
              <span style={{ marginLeft: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Group: </span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                {currentSession.group === 'A_FIRST' ? 'Group A (Interactive → Text)' : 'Group B (Text → Interactive)'}
              </strong>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.74rem', fontFamily: 'var(--font-mono)', background: currentSession.trial1.completed ? 'var(--forest-green-subtle)' : 'var(--surface)', color: currentSession.trial1.completed ? 'var(--forest-green)' : 'var(--ink-secondary)', border: '1px solid var(--rule)' }}>
                Trial 1: {currentSession.trial1.completed ? 'COMPLETED' : 'PENDING'}
              </span>
              <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.74rem', fontFamily: 'var(--font-mono)', background: currentSession.trial2.completed ? 'var(--forest-green-subtle)' : 'var(--surface)', color: currentSession.trial2.completed ? 'var(--forest-green)' : 'var(--ink-secondary)', border: '1px solid var(--rule)' }}>
                Trial 2: {currentSession.trial2.completed ? 'COMPLETED' : 'PENDING'}
              </span>
            </div>
          </div>

          {activeTrial ? (
            <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '2px solid var(--oxide-red)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--oxide-red)', textTransform: 'uppercase', fontWeight: 700 }}>
                    READY TO START · {!currentSession.trial1.completed ? 'TRIAL 1 OF 2' : 'TRIAL 2 OF 2'}
                  </p>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase', marginTop: '0.2rem' }}>
                    {activeTrial.caseId === 'EVAL-CASE-A' ? 'Case A: Coastal Corridor 50-Fan Recovery' : 'Case B: Agricultural 20-Pump Disruption'}
                  </h3>
                </div>
                <div style={{ padding: '0.3rem 0.75rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}>
                  Interface: {activeTrial.interfaceType === 'interactive' ? 'INTERACTIVE GODOWN MAP' : 'TEXT-ONLY BASELINE'}
                </div>
              </div>

              <p style={{ fontSize: '0.86rem', color: 'var(--ink)', marginBottom: '1rem', lineHeight: 1.5 }}>
                Clicking <strong>"Start Active Trial"</strong> will begin the stopwatch timer and load the assigned interface. Inspect the facts, evaluate the cutoff constraint for both orders, and confirm your recovery plan.
              </p>

              <button
                type="button"
                className="btn-primary"
                onClick={() => onBeginTrial(activeTrial.caseId, activeTrial.interfaceType)}
                style={{ padding: '0.65rem 1.6rem', fontSize: '0.95rem' }}
              >
                Start Active Trial ({activeTrial.interfaceType === 'interactive' ? 'Interactive Map' : 'Text Baseline'}) →
              </button>
            </div>
          ) : (
            <div style={{ padding: '1.25rem', background: 'var(--forest-green-subtle)', border: '1px solid var(--forest-green)' }}>
              <p style={{ fontWeight: 700, color: 'var(--forest-green)', fontSize: '1rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                All Assigned Trials Complete!
              </p>
              <p style={{ fontSize: '0.86rem', color: 'var(--ink)' }}>
                Thank you. Both counterbalanced trials have been recorded in the anonymous study log. You can review the aggregate P4 metrics below.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
