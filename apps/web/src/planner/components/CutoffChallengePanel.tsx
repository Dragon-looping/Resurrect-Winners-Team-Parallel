import React, { useState, useEffect } from 'react';
import { CutoffPreviewResult, PlannerOrder } from '../types/planner.ts';
import { AlertIcon, CheckIcon, ClockIcon } from '../../shared/icons.tsx';

interface CutoffChallengePanelProps {
  order: PlannerOrder;
  preview: CutoffPreviewResult | null;
  onPreviewCutoff: (cutoffTime: string) => Promise<void>;
  isPreviewing?: boolean;
}

const CUTOFF_PRESETS = ['14:30', '15:30', '16:00', '16:30', '17:00'];

export const CutoffChallengePanel: React.FC<CutoffChallengePanelProps> = ({
  order,
  preview,
  onPreviewCutoff,
  isPreviewing = false
}) => {
  const [cutoffInput, setCutoffInput] = useState(order.telemetry.dispatchCutoff);

  useEffect(() => {
    setCutoffInput(order.telemetry.dispatchCutoff);
  }, [order.orderId, order.telemetry.dispatchCutoff]);

  const handleRun = async (time: string) => {
    setCutoffInput(time);
    await onPreviewCutoff(time);
  };

  return (
    <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Truck Cutoff Challenge (Non-Mutating Preview)
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
            Test an earlier or later truck cutoff. Preview evaluates BOTH affected orders without modifying the saved plan.
          </p>
        </div>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-secondary)', padding: '0.25rem 0.5rem', border: '1px solid var(--rule)', background: 'var(--surface-subtle)' }}>
          SAVED CUTOFF: <strong className="tabular">{order.telemetry.dispatchCutoff}</strong>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <label htmlFor="cutoff-input" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
          Challenge Cutoff:
        </label>
        <input
          id="cutoff-input"
          type="time"
          value={cutoffInput}
          onChange={e => setCutoffInput(e.target.value)}
          className="tabular"
          style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--rule-dark)', background: 'var(--surface)', fontFamily: 'var(--font-mono)' }}
        />
        <button
          type="button"
          className="btn-primary"
          disabled={isPreviewing}
          onClick={() => handleRun(cutoffInput)}
          style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
        >
          <ClockIcon size={14} />
          <span>{isPreviewing ? 'Simulating...' : 'Preview Cutoff Impact'}</span>
        </button>

        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
          {CUTOFF_PRESETS.map(preset => (
            <button
              key={preset}
              type="button"
              className="btn-secondary"
              disabled={isPreviewing}
              onClick={() => handleRun(preset)}
              style={{
                padding: '0.25rem 0.55rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                borderColor: cutoffInput === preset ? 'var(--oxide-red)' : 'var(--rule-dark)'
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Preview Output */}
      {preview && (
        <div style={{
          border: `2px solid ${preview.feasible ? 'var(--forest-green)' : 'var(--oxide-red)'}`,
          background: 'var(--canvas)',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, color: preview.feasible ? 'var(--forest-green)' : 'var(--oxide-red)' }}>
              {preview.feasible ? <CheckIcon size={16} color="var(--forest-green)" /> : <AlertIcon size={16} color="var(--oxide-red)" />}
              <span>
                {preview.feasible
                  ? `SAFE AT ${preview.requestedCutoff} — ALL AFFECTED ORDERS ON TIME`
                  : `UNSAFE AT ${preview.requestedCutoff} — APPROVAL BLOCKED`}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
              PREVIEW #{preview.previewId} · SAVED PLAN UNCHANGED
            </span>
          </div>

          {preview.unsafeReason && (
            <div style={{ padding: '0.75rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', color: 'var(--oxide-red)', fontSize: '0.85rem', marginBottom: '0.85rem' }}>
              <strong>Exact Infeasibility Reason:</strong> {preview.unsafeReason}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {preview.outcomes.map(out => (
              <div
                key={out.orderId}
                style={{
                  padding: '0.75rem',
                  background: 'var(--surface)',
                  border: `1px solid ${out.onTime ? 'var(--rule)' : 'var(--oxide-red)'}`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', fontWeight: 700 }}>
                    {out.orderId}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: out.onTime ? 'var(--forest-green)' : 'var(--oxide-red)'
                  }}>
                    {out.onTime ? 'ON TIME' : `LATE (+${out.delayMinutes}m)`}
                  </span>
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{out.customerLabel}</div>
                <div className="tabular" style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', marginTop: '0.25rem' }}>
                  Agreed: {out.agreedArrival} · Projected: <strong>{out.projectedArrival}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
