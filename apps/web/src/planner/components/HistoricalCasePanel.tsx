import React, { useState } from 'react';
import { HistoricalCasePoint, PlannerOrder } from '../types/planner.ts';

interface HistoricalCasePanelProps {
  order: PlannerOrder;
}

type RoleKey = 'planner' | 'warehouse' | 'purchasing';

const ROLE_LABELS: Record<RoleKey, string> = {
  planner: 'Planner',
  warehouse: 'Warehouse',
  purchasing: 'Purchasing'
};

/** Linearly interpolate between two values */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map 0..100 coordinate to SVG viewBox */
const SVG_W = 400;
const SVG_H = 280;
const PAD = 24;

function toSvgX(x: number): number {
  return PAD + (x / 100) * (SVG_W - PAD * 2);
}
function toSvgY(y: number): number {
  // y=0 at bottom of chart, y=100 at top
  return SVG_H - PAD - (y / 100) * (SVG_H - PAD * 2);
}

/** Interpolate colour between muted grey and accent red based on similarity */
function similarityColor(sim: number): string {
  if (sim >= 0.85) return 'var(--oxide-red)';
  if (sim >= 0.70) return '#c06030';
  if (sim >= 0.50) return '#a08060';
  return 'var(--ink-muted)';
}

export const HistoricalCasePanel: React.FC<HistoricalCasePanelProps> = ({ order }) => {
  const { historicalCases } = order;
  const [steeringWeight, setSteeringWeight] = useState(0); // 0 = original, 100 = steered
  const [selectedCase, setSelectedCase] = useState<HistoricalCasePoint | null>(null);
  const [activeRole, setActiveRole] = useState<RoleKey>('planner');

  const t = steeringWeight / 100;

  return (
    <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
          Historical Case Panel · P4 Similarity
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
          P4 <code>/cases/steer</code> and <code>/cases/query</code> pending — using fixture embeddings. Similarity scores are interpolated from seeded data.
        </p>
      </div>

      {/* Steering slider */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', color: 'var(--ink-secondary)', marginBottom: '0.5rem', gap: '1rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontSize: '0.74rem' }}>
            Query Steering: {steeringWeight === 0 ? 'Original' : steeringWeight === 100 ? 'Steered (Full)' : `${steeringWeight}% Steered`}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)' }}>
            0 = Original · 100 = Steered
          </span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={steeringWeight}
          onChange={e => setSteeringWeight(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--oxide-red)' }}
        />
        {/* Query text */}
        <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: steeringWeight === 0 || steeringWeight === 100 ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
          {steeringWeight < 100 && (
            <div style={{ padding: '0.65rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)', opacity: 1 - t * 0.5 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', marginBottom: '0.3rem', textTransform: 'uppercase' }}>Original Query</p>
              <p style={{ fontSize: '0.84rem' }}>{historicalCases.originalQuery}</p>
            </div>
          )}
          {steeringWeight > 0 && (
            <div style={{ padding: '0.65rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', opacity: 0.4 + t * 0.6 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--oxide-red)', marginBottom: '0.3rem', textTransform: 'uppercase' }}>Steered Query</p>
              <p style={{ fontSize: '0.84rem' }}>{historicalCases.steeredQueryTemplate}</p>
            </div>
          )}
        </div>
      </div>

      {/* 2D SVG Plot */}
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Embedding Space (Fixed 2D Projection) · Click a point to view details
        </p>
        <div style={{ overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width={SVG_W}
            height={SVG_H}
            style={{ display: 'block', background: 'var(--surface-subtle)', border: '1px solid var(--rule)', maxWidth: '100%' }}
            aria-label="Historical case similarity plot"
          >
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map(v => (
              <g key={v}>
                <line
                  x1={PAD} y1={toSvgY(v)} x2={SVG_W - PAD} y2={toSvgY(v)}
                  stroke="var(--rule)" strokeWidth={0.5}
                />
                <line
                  x1={toSvgX(v)} y1={PAD} x2={toSvgX(v)} y2={SVG_H - PAD}
                  stroke="var(--rule)" strokeWidth={0.5}
                />
              </g>
            ))}

            {/* Case points */}
            {historicalCases.points.map(pt => {
              const sim = lerp(pt.baseSimilarity, pt.steeredSimilarity, t);
              const r = 6 + sim * 8;
              const isSelected = selectedCase?.caseId === pt.caseId;
              return (
                <g
                  key={pt.caseId}
                  onClick={() => setSelectedCase(isSelected ? null : pt)}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  aria-label={`Case ${pt.caseId}: ${pt.title}, similarity ${(sim * 100).toFixed(0)}%`}
                >
                  <circle
                    cx={toSvgX(pt.x)}
                    cy={toSvgY(pt.y)}
                    r={r}
                    fill={similarityColor(sim)}
                    opacity={0.75}
                    stroke={isSelected ? 'var(--ink)' : 'none'}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                  <text
                    x={toSvgX(pt.x)}
                    y={toSvgY(pt.y) - r - 3}
                    textAnchor="middle"
                    fontSize="9"
                    fill="var(--ink-muted)"
                    fontFamily="var(--font-mono)"
                  >
                    {(sim * 100).toFixed(0)}%
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { color: 'var(--oxide-red)', label: '≥ 85% similar' },
            { color: '#c06030', label: '70–85%' },
            { color: '#a08060', label: '50–70%' },
            { color: 'var(--ink-muted)', label: '< 50%' }
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ color: 'var(--ink-secondary)' }}>{label}</span>
            </div>
          ))}
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Circle size ∝ similarity</span>
        </div>
      </div>

      {/* Selected case details */}
      {selectedCase && (() => {
        const sim = lerp(selectedCase.baseSimilarity, selectedCase.steeredSimilarity, t);
        return (
          <div style={{ padding: '1rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  {selectedCase.caseId}
                </p>
                <p style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedCase.title}</p>
                <p style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)', marginTop: '0.2rem' }}>
                  Outcome: {selectedCase.outcome}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', marginBottom: '0.2rem' }}>Similarity</p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, color: similarityColor(sim), lineHeight: 1 }}>
                  {(sim * 100).toFixed(0)}%
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>
              <span>SKU: {selectedCase.sku}</span>
              <span>·</span>
              <span>Evidence: {selectedCase.evidenceRef}</span>
            </div>

            {/* Role briefings tabs */}
            <div>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', marginBottom: '0.75rem' }}>
                {(['planner', 'warehouse', 'purchasing'] as RoleKey[]).map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setActiveRole(role)}
                    style={{
                      padding: '0.4rem 0.9rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      fontWeight: activeRole === role ? 700 : 400,
                      color: activeRole === role ? 'var(--oxide-red)' : 'var(--ink-muted)',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: activeRole === role ? '2px solid var(--oxide-red)' : '2px solid transparent',
                      cursor: 'pointer',
                      marginBottom: '-1px'
                    }}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--ink)', lineHeight: 1.55 }}>
                {selectedCase.roleBriefings[activeRole]}
              </p>
            </div>
          </div>
        );
      })()}

      {!selectedCase && (
        <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
          Click a point in the plot to view case details and role-specific briefings.
        </p>
      )}
    </section>
  );
};
