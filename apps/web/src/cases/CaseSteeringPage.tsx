import React, { useEffect, useState } from 'react';
import {
  analyzeClarification,
  CaseSearchResponse,
  ClarificationResponse,
  searchCasesWithSteering,
  STEERING_PRESETS
} from './caseSteeringAdapter.ts';

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

  const [clarifyInput, setClarifyInput] = useState('Send 50 fans to Manipal');
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

  const pointX = (x: number) => 58 + (x + 1.1) * 291;
  const pointY = (y: number) => 310 - (y + 1.1) * 125;
  const points = searchResult?.projection_points ?? [];
  const base = points.find(p => p.case_id === 'QUERY_BASE');
  const steered = points.find(p => p.case_id === 'QUERY_STEERED');
  const selected = searchResult?.results.find(hit => hit.case.case_id === selectedCaseId);
  const samples = ['50 industrial fans Manipal urgent Friday Udupi shortage', '20 submersible pumps Kundapura urgent irrigation', '100 bulk fans Mangalore single load'];
  const clarificationSamples = ['Send 50 fans to Manipal by Friday', 'Send 50 FAN-HV-24-IND industrial fans to Manipal by 2026-11-27 arrival at dock, split delivery ok', 'Need 50 fans to Manipal all together in single load, split delivery ok', 'Send some items soon'];
  return <article className="analyst">
    <header><small>Case retrieval / Analyst workspace</small><h1>Case steering</h1></header>
    <label className="query-line">Query<input list="query-samples" value={query} onChange={e => setQuery(e.target.value)}/></label>
    <datalist id="query-samples">{samples.map(s => <option key={s}>{s}</option>)}</datalist>
    <div className="steering-line">
      <select aria-label="Steering direction" value={steeringDirection} onChange={e => setSteeringDirection(e.target.value)}>{STEERING_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
      <span>Away</span><input id="steering-slider" aria-label="Steering strength" type="range" min="-1.5" max="1.5" step=".1" value={steeringStrength} onChange={e => setSteeringStrength(Number(e.target.value))}/><span>Toward</span><output>{steeringStrength.toFixed(1)}</output>
    </div>
    {searchError && <p role="alert">{searchError}</p>}
    <div className="analysis-grid">
      <section><h2>Case similarity</h2><p>Historical cases on a fixed projection</p>
        <svg viewBox="0 0 726 370" className="projection" aria-label="Interactive case projection">
          {[-1,-.5,0,.5,1].map(v => <g key={v} stroke="#dbe1e8"><path d={`M ${pointX(v)} 33 V310 M58 ${pointY(v)} H700`}/><g stroke="none" fill="#526079" fontSize="13"><text x={pointX(v)} y="331" textAnchor="middle">{v}</text><text x="48" y={pointY(v)+4} textAnchor="end">{v}</text></g></g>)}
          <path d="M58 33V310H700" stroke="#657388" fill="none"/><text x="370" y="358" textAnchor="middle">Component 1</text><text transform="translate(16 170) rotate(-90)" textAnchor="middle">Component 2</text>
          {points.filter(p => !p.is_query && !p.is_steered_query && !p.case_id.startsWith('QUERY_')).map(p => <g key={p.case_id} role="button" tabIndex={0} aria-label={p.label} aria-pressed={selectedCaseId === p.case_id} onKeyDown={e => {if (['Enter',' '].includes(e.key)) {e.preventDefault();setSelectedCaseId(p.case_id);}}} onClick={() => setSelectedCaseId(p.case_id)}>
            <circle cx={pointX(p.x)} cy={pointY(p.y)} r="12" fill="transparent"/><circle cx={pointX(p.x)} cy={pointY(p.y)} r={selectedCaseId === p.case_id ? 8 : 5.5} fill={selectedCaseId === p.case_id ? 'var(--cobalt)' : 'var(--ink)'}/><title>{p.label}</title>
          </g>)}
          {base && steered && <line x1={pointX(base.x)} y1={pointY(base.y)} x2={pointX(steered.x)} y2={pointY(steered.y)} stroke="var(--cobalt)" strokeDasharray="3 4" strokeWidth="2"/>}
          {base && <circle cx={pointX(base.x)} cy={pointY(base.y)} r="7" fill="white" stroke="var(--cobalt)" strokeWidth="3"/>}
          {steered && <path transform={`translate(${pointX(steered.x)} ${pointY(steered.y)})`} d="M0 -9 9 0 0 9 -9 0Z" fill="var(--cobalt)" stroke="white"/>}
        </svg>
        <div className="plot-key"><span>◯　Original query</span><span>◆　Steered query</span><span>●　Historical case</span></div>
        {selectedCaseId && <p className="case-detail"><strong>{selected?.case.title ?? points.find(p => p.case_id === selectedCaseId)?.label}</strong><br/>{selected ? <>{selected.case.origin_hub} → {selected.case.destination_hub} · {RESOLUTION_LABELS[selected.case.resolution_type] ?? selected.case.resolution_type}<br/>Base {selected.base_similarity_score.toFixed(3)} · Rank change {selected.rank_delta}</> : 'Outside the returned rankings'}</p>}
      </section>
      <section><h2>Retrieved cases</h2><div className="ranking"><small>#　 Historical case</small><small>Similarity</small></div>
        <div className="rank-list">{searchResult?.results.map(h => <button key={h.case.case_id} aria-pressed={selectedCaseId === h.case.case_id} onClick={() => setSelectedCaseId(h.case.case_id)}><b>{h.rank}</b><span><strong>{h.case.title}</strong><small>{h.case.outcome_summary}</small></span><output>{h.similarity_score.toFixed(3)}</output></button>)}</div>
      </section>
    </div>
    <section className="clarification"><small>Clarification</small><h2>{clarifyResult?.questions[0]?.question_text || clarifyResult?.brief_explanation || 'Review request'}</h2>
      {clarifyResult?.questions.map(q => <div key={q.question_id}>{q !== clarifyResult.questions[0] && <strong>{q.question_text}</strong>}<p>{q.reason}</p>{q.options.map(o => <button key={o.id} className="btn-secondary" onClick={() => setClarifyInput(text => (q.field === 'must_arrive_together' ? text.replace(/all together|single load|no split|split ok|split delivery ok|split fine/gi, '') : text) + ', ' + o.label)}>{o.label}</button>)}</div>)}
      <label>Request text<input aria-label="Clarification request text" list="clarify-samples" value={clarifyInput} onChange={e => setClarifyInput(e.target.value)}/></label><datalist id="clarify-samples">{clarificationSamples.map(s => <option key={s}>{s}</option>)}</datalist>
      {clarifyError && <p role="alert">{clarifyError}</p>}
      {clarifyResult && <details><summary>Analysis and suggested defaults</summary><p>{clarifyResult.brief_explanation} · Confidence {Math.round(clarifyResult.confidence * 100)}% · Can proceed: {clarifyResult.can_proceed ? 'Yes' : 'No'}</p>{clarifyResult.safe_defaults.map(d => <p key={d.field}>{d.label} — {d.rationale}</p>)}</details>}
    </section>
  </article>;
};
