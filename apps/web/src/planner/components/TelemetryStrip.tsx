import React from 'react';
import { PlannerOrder, TelemetrySnapshot } from '../types/planner.ts';
import { AlertIcon, ClockIcon, CheckIcon } from '../../shared/icons.tsx';

interface TelemetryStripProps {
  order: PlannerOrder;
  telemetry: TelemetrySnapshot;
  streamError?: string | null;
}

export const TelemetryStrip: React.FC<TelemetryStripProps> = ({
  order,
  telemetry,
  streamError
}) => {
  const highRisk = telemetry.stockOutRiskPercent >= 50;

  return (
    <section style={{ marginBottom: '1.5rem' }}>
      {/* Stale-feed or live stream warning banner */}
      {(telemetry.isFeedStale || streamError) && (
        <div style={{
          padding: '0.8rem 1rem',
          background: 'var(--amber-subtle)',
          border: '1px solid var(--amber-warning)',
          color: 'var(--amber-warning)',
          marginBottom: '0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>
            <AlertIcon size={16} color="var(--amber-warning)" />
            <span>
              STALE TELEMETRY WARNING: {telemetry.staleReason || streamError}
            </span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            LAST FEED: {new Date(telemetry.feedLastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Ruled Telemetry Strip */}
      <div className="ruled-box" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        background: 'var(--surface)'
      }}>
        <div style={{ padding: '0.9rem 1rem', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
            Original Agreed Arrival
          </div>
          <div className="tabular" style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: '0.2rem' }}>
            {telemetry.agreedArrival}
          </div>
        </div>

        <div style={{ padding: '0.9rem 1rem', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
            Projected Ship / Arrival
          </div>
          <div className="tabular" style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '0.2rem' }}>
            Ship: {telemetry.projectedShip}
          </div>
          <div className="tabular" style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)' }}>
            Arr: {telemetry.projectedArrival}
          </div>
        </div>

        <div style={{ padding: '0.9rem 1rem', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
            Backlog
          </div>
          <div className="tabular" style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.65rem',
            fontWeight: 700,
            color: telemetry.backlogUnits > 0 ? 'var(--oxide-red)' : 'var(--forest-green)',
            lineHeight: 1.1,
            marginTop: '0.15rem'
          }}>
            {telemetry.backlogUnits} {order.unitLabel.toUpperCase()}
          </div>
        </div>

        <div style={{ padding: '0.9rem 1rem', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
            Stock-Out Risk
          </div>
          <div className="tabular" style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.65rem',
            fontWeight: 700,
            color: highRisk ? 'var(--oxide-red)' : 'var(--forest-green)',
            lineHeight: 1.1,
            marginTop: '0.15rem'
          }}>
            {telemetry.stockOutRiskPercent}%
          </div>
        </div>

        <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
            Dispatch Cutoff &amp; Stream
          </div>
          <div className="tabular" style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ClockIcon size={14} color="var(--oxide-red)" />
            <span>{telemetry.dispatchCutoff}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: telemetry.streamConnected ? 'var(--forest-green)' : 'var(--ink-muted)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {telemetry.streamConnected ? <CheckIcon size={12} color="var(--forest-green)" /> : <AlertIcon size={12} color="var(--amber-warning)" />}
            <span>{telemetry.streamConnected ? 'P2 STREAM LIVE' : 'P2 STREAM POLL/FIXTURE'}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
