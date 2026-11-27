import React from 'react';
import { StudyResultsSummary, TrialSubmission } from '../types/evaluation.ts';
import { RotateCcwIcon, CheckIcon, AlertIcon } from '../../shared/icons.tsx';

interface StudyResultsSummaryPanelProps {
  submissions: TrialSubmission[];
  onResetStudy: () => void;
}

export function computeStudySummary(submissions: TrialSubmission[]): StudyResultsSummary {
  const participants = Array.from(new Set(submissions.map(s => s.participantId)));
  const totalParticipants = participants.length;

  const completedSessions = participants.filter(pid => {
    const pSubs = submissions.filter(s => s.participantId === pid);
    return pSubs.length >= 2;
  }).length;

  const interactiveSubs = submissions.filter(s => s.interfaceType === 'interactive');
  const textSubs = submissions.filter(s => s.interfaceType === 'text_baseline');

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const rate = (count: number, total: number) => (total > 0 ? (count / total) * 100 : 0);

  const interactiveFirstCount = participants.filter(pid => {
    const first = submissions.find(s => s.participantId === pid);
    return first?.interfaceType === 'interactive';
  }).length;

  const textFirstCount = participants.filter(pid => {
    const first = submissions.find(s => s.participantId === pid);
    return first?.interfaceType === 'text_baseline';
  }).length;

  const failures = submissions
    .filter(s => !s.isCorrectOptimal && !s.isAcceptable)
    .map(s => ({
      participantId: s.participantId,
      interfaceType: s.interfaceType,
      caseId: s.caseId,
      failureReason: s.brokeDonorPromise
        ? 'Broke donor customer delivery promise via unsafe cutoff'
        : 'Selected infeasible wait candidate violating primary SLA'
    }));

  // Practice effect: compare trial index 1 vs trial index 2 across participants
  const trial1Subs: TrialSubmission[] = [];
  const trial2Subs: TrialSubmission[] = [];
  participants.forEach(pid => {
    const pSubs = submissions.filter(s => s.participantId === pid);
    if (pSubs[0]) trial1Subs.push(pSubs[0]);
    if (pSubs[1]) trial2Subs.push(pSubs[1]);
  });

  const t1Acc = trial1Subs.length ? rate(trial1Subs.filter(s => s.isCorrectOptimal).length, trial1Subs.length) : 0;
  const t2Acc = trial2Subs.length ? rate(trial2Subs.filter(s => s.isCorrectOptimal).length, trial2Subs.length) : 0;

  return {
    totalParticipants,
    completedSessions,
    interfaceOrderBreakdown: {
      interactiveFirstCount,
      textFirstCount
    },
    metricsByInterface: {
      interactive: {
        averageElapsedSeconds: Math.round(avg(interactiveSubs.map(s => s.elapsedSeconds))),
        optimalDecisionRate: Math.round(rate(interactiveSubs.filter(s => s.isCorrectOptimal).length, interactiveSubs.length)),
        acceptableDecisionRate: Math.round(rate(interactiveSubs.filter(s => s.isAcceptable).length, interactiveSubs.length)),
        brokenDonorPromiseRate: Math.round(rate(interactiveSubs.filter(s => s.brokeDonorPromise).length, interactiveSubs.length)),
        averagePerceivedControl: Number(avg(interactiveSubs.map(s => s.perceivedControlScore)).toFixed(2))
      },
      text_baseline: {
        averageElapsedSeconds: Math.round(avg(textSubs.map(s => s.elapsedSeconds))),
        optimalDecisionRate: Math.round(rate(textSubs.filter(s => s.isCorrectOptimal).length, textSubs.length)),
        acceptableDecisionRate: Math.round(rate(textSubs.filter(s => s.isAcceptable).length, textSubs.length)),
        brokenDonorPromiseRate: Math.round(rate(textSubs.filter(s => s.brokeDonorPromise).length, textSubs.length)),
        averagePerceivedControl: Number(avg(textSubs.map(s => s.perceivedControlScore)).toFixed(2))
      }
    },
    failures,
    practiceEffectAnalysis: {
      trial1Accuracy: Math.round(t1Acc),
      trial2Accuracy: Math.round(t2Acc),
      limitationNote:
        'Within-subjects counterbalancing alternates interface order between participants. Due to rapid cognitive transfer, participants who complete the interactive interface first often carry forward the cutoff-safety heuristic into the text condition.'
    }
  };
}

export const StudyResultsSummaryPanel: React.FC<StudyResultsSummaryPanelProps> = ({
  submissions,
  onResetStudy
}) => {
  const summary = computeStudySummary(submissions);
  const isEmpty = submissions.length === 0;

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(summary, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `setuvyuha_ps3_study_summary_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <section className="ruled-box" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
            RESEARCH HANDOFF · PERSON 4 EVALUATION SUMMARY
          </p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, textTransform: 'uppercase' }}>
            PS3 User Study Results
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
            Comparing Interactive Godown Tower vs Text Baseline on Dual-Customer Inventory Disruption Decisions.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportJson}
            disabled={isEmpty}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
          >
            Export JSON for P4
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onResetStudy}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', color: 'var(--oxide-red)' }}
          >
            <RotateCcwIcon size={13} />
            <span>Reset Study Data</span>
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div style={{ padding: '2rem 1.5rem', textAlign: 'center', background: 'var(--surface-subtle)', border: '1px dashed var(--rule)' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-secondary)', marginBottom: '0.5rem' }}>
            No Participant Trials Recorded Yet
          </p>
          <p style={{ fontSize: '0.86rem', color: 'var(--ink-muted)', maxWidth: '540px', margin: '0 auto', lineHeight: 1.5 }}>
            The study summary remains intentionally empty until participants execute the counterbalanced trial protocol. Begin a session above to record latency, decision accuracy, and perceived control metrics.
          </p>
        </div>
      ) : (
        <div>
          {/* Top-level numbers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Participants</span>
              <p className="tabular" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.totalParticipants}</p>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Completed Sessions</span>
              <p className="tabular" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.completedSessions}</p>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Group A (Interactive 1st)</span>
              <p className="tabular" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.interfaceOrderBreakdown.interactiveFirstCount}</p>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Group B (Text 1st)</span>
              <p className="tabular" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.interfaceOrderBreakdown.textFirstCount}</p>
            </div>
          </div>

          {/* Comparative Metrics Table */}
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface-subtle)', borderBottom: '2px solid var(--rule-dark)' }}>
                  {['Interface Condition', 'Avg Completion Time', 'Optimal Decision Rate', 'Acceptable Rate', 'Broken Donor Promises', 'Mean Perceived Control (1–5)'].map(h => (
                    <th key={h} style={{ padding: '0.65rem 0.75rem', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--rule)', background: 'var(--forest-green-subtle)' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 700 }}>
                    <div>Interactive Godown Tower</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--forest-green)' }}>Spatial Route Map + Visual Simulator</div>
                  </td>
                  <td className="tabular" style={{ padding: '0.75rem', fontWeight: 700 }}>{summary.metricsByInterface.interactive.averageElapsedSeconds}s</td>
                  <td className="tabular" style={{ padding: '0.75rem', color: 'var(--forest-green)', fontWeight: 700 }}>{summary.metricsByInterface.interactive.optimalDecisionRate}%</td>
                  <td className="tabular" style={{ padding: '0.75rem' }}>{summary.metricsByInterface.interactive.acceptableDecisionRate}%</td>
                  <td className="tabular" style={{ padding: '0.75rem', color: summary.metricsByInterface.interactive.brokenDonorPromiseRate === 0 ? 'var(--forest-green)' : 'var(--oxide-red)', fontWeight: 700 }}>
                    {summary.metricsByInterface.interactive.brokenDonorPromiseRate}%
                  </td>
                  <td className="tabular" style={{ padding: '0.75rem', fontWeight: 700 }}>{summary.metricsByInterface.interactive.averagePerceivedControl} / 5.0</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                    <div>Text-Only Baseline</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Tabular Log without Spatial Map</div>
                  </td>
                  <td className="tabular" style={{ padding: '0.75rem' }}>{summary.metricsByInterface.text_baseline.averageElapsedSeconds}s</td>
                  <td className="tabular" style={{ padding: '0.75rem', fontWeight: 600 }}>{summary.metricsByInterface.text_baseline.optimalDecisionRate}%</td>
                  <td className="tabular" style={{ padding: '0.75rem' }}>{summary.metricsByInterface.text_baseline.acceptableDecisionRate}%</td>
                  <td className="tabular" style={{ padding: '0.75rem', color: summary.metricsByInterface.text_baseline.brokenDonorPromiseRate > 0 ? 'var(--oxide-red)' : 'inherit', fontWeight: 700 }}>
                    {summary.metricsByInterface.text_baseline.brokenDonorPromiseRate}%
                  </td>
                  <td className="tabular" style={{ padding: '0.75rem' }}>{summary.metricsByInterface.text_baseline.averagePerceivedControl} / 5.0</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Failure Incidents */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
              Failure Incident Log ({summary.failures.length} recorded)
            </h3>
            {summary.failures.length === 0 ? (
              <div style={{ padding: '0.75rem', background: 'var(--forest-green-subtle)', border: '1px solid var(--forest-green)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <CheckIcon size={16} color="var(--forest-green)" />
                <span style={{ fontSize: '0.84rem', color: 'var(--forest-green)', fontWeight: 600 }}>
                  Zero failure incidents recorded across all completed trials.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {summary.failures.map((f, i) => (
                  <div key={i} style={{ padding: '0.65rem 0.85rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <AlertIcon size={15} color="var(--oxide-red)" />
                      <strong>{f.participantId}</strong>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>({f.interfaceType})</span>
                      <span>{f.caseId}</span>
                    </div>
                    <span style={{ color: 'var(--oxide-red)', fontWeight: 600 }}>{f.failureReason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Practice Effect & Limitations Note for P4 */}
          <div style={{ padding: '1rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '0.35rem' }}>
              Practice-Effect &amp; Experimental Limitations (P4 Academic Documentation)
            </p>
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.5rem', fontSize: '0.84rem' }}>
              <span>Trial 1 Accuracy: <strong>{summary.practiceEffectAnalysis.trial1Accuracy}%</strong></span>
              <span>Trial 2 Accuracy: <strong>{summary.practiceEffectAnalysis.trial2Accuracy}%</strong></span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
              {summary.practiceEffectAnalysis.limitationNote}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
