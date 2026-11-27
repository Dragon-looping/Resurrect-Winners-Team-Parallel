import React, { useEffect, useState } from 'react';
import {
  analyzeClarification,
  CaseSearchResponse,
  ClarificationResponse,
  searchCasesWithSteering,
  STEERING_PRESETS
} from './caseSteeringAdapter.ts';
import { AlertIcon, CheckIcon, HelpCircleIcon } from '../shared/icons.tsx';

const RESOLUTION_LABELS: Record<string, string> = {
  split_delivery: 'Split Delivery',
  later_single_delivery: 'Later Consolidated',
  inter_hub_recovery: 'Inter-Hub Recovery',
  standard_fulfilment: 'Standard Direct',
  clarification_resolved: 'Clarified'
};

export const CaseSteeringPage: React.FC = () => {
  const [query, setQuery] = useState('50 industrial fans Manipal urgent Friday Udupi shortage');
  const [steeringDirection, setSteeringDirection] = useState('split_delivery');
  const [steeringStrength, setSteeringStrength] = useState(0.5);
  const [searchResult, setSearchResult] = useState<CaseSearchResponse | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [clarifyInput, setClarifyInput] = useState('Send 50 fans to Manipal by Friday');
  const [clarifyResult, setClarifyResult] = useState<ClarificationResponse | null>(null);
  const [clarifyError, setClarifyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    searchCasesWithSteering({
      query,
      steeringDirection,
      steeringStrength,
      topK: 6
    })
      .then((res) => {
        if (!cancelled) {
          setSearchResult(res);
          setSearchError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSearchError(err instanceof Error ? err.message : 'Unable to execute case search.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query, steeringDirection, steeringStrength]);

  useEffect(() => {
    let cancelled = false;
    analyzeClarification(clarifyInput)
      .then((res) => {
        if (!cancelled) {
          setClarifyResult(res);
          setClarifyError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setClarifyError(err instanceof Error ? err.message : 'Unable to run clarification check.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clarifyInput]);

  const toSvgCoord = (val: number, invert = false): number => {
    const clamped = Math.max(-1.1, Math.min(1.1, val));
    const norm = (clamped + 1.1) / 2.2;
    return invert ? 240 - norm * 200 : 20 + norm * 280;
  };

  const baseQueryPt = searchResult?.projection_points.find((p) => p.case_id === 'QUERY_BASE');
  const steeredQueryPt = searchResult?.projection_points.find((p) => p.case_id === 'QUERY_STEERED');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Banner */}
      <div className="ruled-box" style={{ padding: '1.5rem', background: 'var(--surface)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
          P4 · Case Steering, 2D Projection & Clarification Console
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.15 }}>
          Historical Case Retrieval & Vector Steering
        </h1>
        <p style={{ color: 'var(--ink-secondary)', marginTop: '0.4rem', maxWidth: '75ch' }}>
          Adjust the steering slider to shift retrieval priority across historical regional fulfilment outcomes while keeping base case records immutable and 2D projection coordinates fixed.
        </p>
      </div>

      {/* Controls + 2D Scatter Plot */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        <div className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="case-search-query" style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              Search Query
            </label>
            <input
              id="case-search-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid var(--rule-dark)', background: 'var(--canvas)', fontFamily: 'var(--font-body)' }}
            />
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {[
                '50 industrial fans Manipal urgent Friday Udupi shortage',
                '20 submersible pumps Kundapura urgent irrigation',
                '100 bulk fans Mangalore single load'
              ].map((presetText) => (
                <button
                  key={presetText}
                  type="button"
                  onClick={() => setQuery(presetText)}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', border: '1px solid var(--rule-dark)', background: 'var(--surface-subtle)', color: 'var(--ink-secondary)' }}
                >
                  {presetText.slice(0, 34)}...
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="steering-direction" style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>
              Steering Direction Axis
            </label>
            <select
              id="steering-direction"
              value={steeringDirection}
              onChange={(e) => setSteeringDirection(e.target.value)}
              style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid var(--rule-dark)', background: 'var(--canvas)' }}
            >
              {STEERING_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label htmlFor="steering-slider" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Steering Strength Slider
              </label>
              <span className="tabular" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: steeringStrength === 0 ? 'var(--ink-muted)' : 'var(--oxide-red)' }}>
                {steeringStrength >= 0 ? `+${steeringStrength.toFixed(2)}` : steeringStrength.toFixed(2)}
              </span>
            </div>
            <input
              id="steering-slider"
              type="range"
              min={-1.5}
              max={1.5}
              step={0.1}
              value={steeringStrength}
              onChange={(e) => setSteeringStrength(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--oxide-red)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
              <span>-1.50 (Steer Away)</span>
              <span>0.00 (Neutral)</span>
              <span>+1.50 (Steer Toward)</span>
            </div>
          </div>

          {searchError && (
            <div style={{ padding: '0.65rem', border: '1px solid var(--oxide-red)', background: 'var(--oxide-red-subtle)', color: 'var(--oxide-red)', fontSize: '0.85rem' }}>
              {searchError}
            </div>
          )}
        </div>

        {/* Fixed 2D Projection Scatter Plot */}
        <div className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', textTransform: 'uppercase' }}>
              Fixed 2D Embedding Projection
            </h2>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
              D={searchResult?.embedding_dimension ?? 64} · STABLE BASIS
            </span>
          </div>

          <svg viewBox="0 0 320 260" style={{ width: '100%', height: 'auto', border: '1px solid var(--rule)', background: 'var(--canvas)' }} role="img" aria-label="2D Case Embedding Projection">
            {/* Axes */}
            <line x1="20" y1="140" x2="300" y2="140" stroke="#D6D3D1" strokeDasharray="3 3" />
            <line x1="160" y1="30" x2="160" y2="240" stroke="#D6D3D1" strokeDasharray="3 3" />
            <text x="24" y="22" fontSize="9" fill="#57534E" fontFamily="monospace">SPLIT / RECOVERY (-X)  |  SINGLE / LATER (+X)</text>

            {/* Steering Vector Arrow */}
            {baseQueryPt && steeredQueryPt && (
              <line
                x1={toSvgCoord(baseQueryPt.x)}
                y1={toSvgCoord(baseQueryPt.y, true)}
                x2={toSvgCoord(steeredQueryPt.x)}
                y2={toSvgCoord(steeredQueryPt.y, true)}
                stroke="#991B1B"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
            )}

            {/* Corpus Case Points */}
            {searchResult?.projection_points
              .filter((p) => !p.is_query)
              .map((pt) => {
                const cx = toSvgCoord(pt.x);
                const cy = toSvgCoord(pt.y, true);
                const isSelected = selectedCaseId === pt.case_id;
                return (
                  <g key={pt.case_id} style={{ cursor: 'pointer' }} onClick={() => setSelectedCaseId(pt.case_id)}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 6.5 : 4.5}
                      fill={isSelected ? '#991B1B' : '#18181B'}
                      stroke="#FAF8F5"
                      strokeWidth="1.5"
                    />
                    <title>{`${pt.case_id}: (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`}</title>
                  </g>
                );
              })}

            {/* Query Base Point */}
            {baseQueryPt && (
              <g>
                <rect
                  x={toSvgCoord(baseQueryPt.x) - 5}
                  y={toSvgCoord(baseQueryPt.y, true) - 5}
                  width="10"
                  height="10"
                  fill="#FAF8F5"
                  stroke="#18181B"
                  strokeWidth="2"
                />
                <text x={toSvgCoord(baseQueryPt.x) + 8} y={toSvgCoord(baseQueryPt.y, true) + 3} fontSize="9" fontWeight="700" fill="#18181B">
                  Q
                </text>
              </g>
            )}

            {/* Steered Query Point */}
            {steeredQueryPt && (
              <g>
                <polygon
                  points={`${toSvgCoord(steeredQueryPt.x)},${toSvgCoord(steeredQueryPt.y, true) - 7} ${toSvgCoord(steeredQueryPt.x) + 6},${toSvgCoord(steeredQueryPt.y, true) + 5} ${toSvgCoord(steeredQueryPt.x) - 6},${toSvgCoord(steeredQueryPt.y, true) + 5}`}
                  fill="#991B1B"
                />
                <text x={toSvgCoord(steeredQueryPt.x) + 8} y={toSvgCoord(steeredQueryPt.y, true) + 3} fontSize="9" fontWeight="700" fill="#991B1B">
                  Q*
                </text>
              </g>
            )}
          </svg>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.5rem', fontFamily: 'var(--font-mono)' }}>
            <span>● Historical Case</span>
            <span>□ Q (Unsteered)</span>
            <span style={{ color: 'var(--oxide-red)' }}>▲ Q* (Steered)</span>
          </div>
        </div>
      </div>

      {/* Ranked Cases Ledger */}
      <div className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', textTransform: 'uppercase' }}>
            Ranked Historical Cases
          </h2>
          <span className="tabular" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
            {searchResult?.results.length ?? 0} SHOWN / {searchResult?.total_matches ?? 0} TOTAL
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--ink)', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.5rem' }}>Rank</th>
                <th style={{ padding: '0.5rem' }}>Δ</th>
                <th style={{ padding: '0.5rem' }}>Case</th>
                <th style={{ padding: '0.5rem' }}>Route</th>
                <th style={{ padding: '0.5rem' }}>Resolution</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Base</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Steered</th>
              </tr>
            </thead>
            <tbody>
              {searchResult?.results.map((hit) => {
                const isSelected = selectedCaseId === hit.case.case_id;
                return (
                  <tr
                    key={hit.case.case_id}
                    onClick={() => setSelectedCaseId(hit.case.case_id)}
                    style={{
                      borderBottom: '1px solid var(--rule)',
                      background: isSelected ? 'var(--oxide-red-subtle)' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    <td className="tabular" style={{ padding: '0.6rem 0.5rem', fontWeight: 700 }}>#{hit.rank}</td>
                    <td className="tabular" style={{ padding: '0.6rem 0.5rem', fontFamily: 'var(--font-mono)', color: hit.rank_delta > 0 ? 'var(--forest-green)' : hit.rank_delta < 0 ? 'var(--oxide-red)' : 'var(--ink-faint)' }}>
                      {hit.rank_delta > 0 ? `+${hit.rank_delta}` : hit.rank_delta === 0 ? '0' : `${hit.rank_delta}`}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      <div style={{ fontWeight: 600 }}>{hit.case.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{hit.case.outcome_summary}</div>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                      {hit.case.origin_hub} → {hit.case.destination_hub}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      {RESOLUTION_LABELS[hit.case.resolution_type] ?? hit.case.resolution_type}
                    </td>
                    <td className="tabular" style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>
                      {hit.base_similarity_score.toFixed(3)}
                    </td>
                    <td className="tabular" style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--oxide-red)' }}>
                      {hit.similarity_score.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ambiguity & Clarification Console */}
      <div className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <HelpCircleIcon size={18} color="var(--amber-warning)" />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', textTransform: 'uppercase' }}>
            Ambiguity Detection & Minimal Clarification (POST /clarify)
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {[
            'Send 50 fans to Manipal by Friday',
            'Send 50 FAN-HV-24-IND industrial fans to Manipal by 2026-11-27 arrival at dock, split delivery ok',
            'Need 50 fans to Manipal all together in single load, split delivery ok',
            'Send some items soon'
          ].map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => setClarifyInput(sample)}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem', border: '1px solid var(--rule-dark)', background: 'var(--surface-subtle)' }}
            >
              {sample.slice(0, 44)}{sample.length > 44 ? '...' : ''}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={clarifyInput}
          onChange={(e) => setClarifyInput(e.target.value)}
          aria-label="Clarification request text"
          style={{ width: '100%', padding: '0.65rem 0.75rem', border: '1px solid var(--rule-dark)', background: 'var(--canvas)', marginBottom: '1rem' }}
        />

        {clarifyError && (
          <div style={{ padding: '0.65rem', border: '1px solid var(--oxide-red)', background: 'var(--oxide-red-subtle)', color: 'var(--oxide-red)' }}>
            {clarifyError}
          </div>
        )}

        {clarifyResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div
              style={{
                padding: '0.75rem 1rem',
                border: `1px solid ${clarifyResult.can_proceed ? 'var(--forest-green)' : 'var(--amber-warning)'}`,
                background: clarifyResult.can_proceed ? 'var(--forest-green-subtle)' : 'var(--amber-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {clarifyResult.can_proceed ? (
                  <CheckIcon size={18} color="var(--forest-green)" />
                ) : (
                  <AlertIcon size={18} color="var(--amber-warning)" />
                )}
                <strong>{clarifyResult.brief_explanation}</strong>
              </div>
              <span className="tabular" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                CAN PROCEED: {clarifyResult.can_proceed ? 'YES' : 'NO'} · CONFIDENCE: {(clarifyResult.confidence * 100).toFixed(0)}%
              </span>
            </div>

            {clarifyResult.questions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
                  Minimal Targeted Questions ({clarifyResult.questions.length})
                </div>
                {clarifyResult.questions.map((q) => (
                  <div key={q.question_id} style={{ padding: '0.75rem', border: '1px solid var(--rule)', background: 'var(--canvas)' }}>
                    <div style={{ fontWeight: 600 }}>
                      P{q.priority}. {q.question_text}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: '0.2rem' }}>{q.reason}</div>
                  </div>
                ))}
              </div>
            )}

            {clarifyResult.safe_defaults.length > 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', borderTop: '1px solid var(--rule)', paddingTop: '0.6rem' }}>
                <strong>Safe Default Suggestions (not confirmed facts): </strong>
                {clarifyResult.safe_defaults.map((d) => `${d.label} — ${d.rationale}`).join(' | ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
