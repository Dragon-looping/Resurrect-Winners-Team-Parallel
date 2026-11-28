import React, { useState, useEffect } from 'react';
import { CutoffPreviewResult, PlannerOrder } from '../types/planner.ts';

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

  return <section className="preview-content"><h2>Cutoff preview</h2>
    <div className="cutoff-pair"><label>Saved cutoff<strong>{order.telemetry.dispatchCutoff}</strong></label><span>→</span><label>Proposed cutoff<input aria-label="Proposed cutoff" type="time" value={cutoffInput} onChange={e => setCutoffInput(e.target.value)}/></label></div>
    <div className="cutoff-times">{CUTOFF_PRESETS.map(t => <button key={t} disabled={isPreviewing} onClick={() => handleRun(t)}>{t}</button>)}</div>
    <button className="preview-run" disabled={isPreviewing || !cutoffInput} onClick={() => handleRun(cutoffInput)}>Preview cutoff impact</button>
    {preview && <div className="preview-result" aria-live="polite"><strong data-safe={preview.feasible}>{preview.feasible ? 'On time' : 'Approval blocked'} · {preview.requestedCutoff}</strong>
      {preview.unsafeReason && <p>{preview.unsafeReason}</p>}
      {preview.outcomes.map(o => <div key={o.orderId}><b>{o.customerLabel}</b> · {o.onTime ? 'On time' : o.delayMinutes + ' min late'}<small>Agreed {o.agreedArrival} · Projected {o.projectedArrival}</small></div>)}
    </div>}
  </section>;
};
