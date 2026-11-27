import type { StudyResultsSummary, TrialSubmission } from '../types/evaluation.ts';

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
