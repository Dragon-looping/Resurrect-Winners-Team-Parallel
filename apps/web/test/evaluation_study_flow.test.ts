import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  EvaluationAdapter,
  resetEvaluationStore
} from '../src/evaluation/adapters/evaluationAdapter.ts';
import { computeStudySummary } from '../src/evaluation/utils/summaryStats.ts';
import type { TrialSubmission } from '../src/evaluation/types/evaluation.ts';

describe('PS3 Evaluation: Counterbalanced Study Flow & Metrics (Checkpoint 10)', () => {
  let adapter: EvaluationAdapter;

  beforeEach(() => {
    resetEvaluationStore();
    adapter = new EvaluationAdapter();
  });

  test('ES-01: Initial study summary is empty before participants begin', () => {
    const subs = adapter.listSubmissions();
    assert.equal(subs.length, 0);

    const summary = computeStudySummary(subs);
    assert.equal(summary.totalParticipants, 0);
    assert.equal(summary.completedSessions, 0);
    assert.equal(summary.failures.length, 0);
    assert.equal(summary.metricsByInterface.interactive.averageElapsedSeconds, 0);
    assert.equal(summary.metricsByInterface.text_baseline.averageElapsedSeconds, 0);
  });

  test('ES-02: Counterbalancing assigns alternating groups to consecutive participants', () => {
    const s1 = adapter.getOrCreateSession('P-01');
    assert.equal(s1.group, 'A_FIRST');
    assert.equal(s1.trial1.interfaceType, 'interactive');
    assert.equal(s1.trial1.caseId, 'EVAL-CASE-A');
    assert.equal(s1.trial2.interfaceType, 'text_baseline');
    assert.equal(s1.trial2.caseId, 'EVAL-CASE-B');

    const s2 = adapter.getOrCreateSession('P-02');
    assert.equal(s2.group, 'B_FIRST');
    assert.equal(s2.trial1.interfaceType, 'text_baseline');
    assert.equal(s2.trial1.caseId, 'EVAL-CASE-B');
    assert.equal(s2.trial2.interfaceType, 'interactive');
    assert.equal(s2.trial2.caseId, 'EVAL-CASE-A');
  });

  test('ES-03: Full trial flow records latency, accuracy, and practice effects for P4', () => {
    // Participant 1 (Group A): completes Trial 1 (Optimal) and Trial 2 (Acceptable)
    adapter.getOrCreateSession('P-01');
    const sub1: TrialSubmission = {
      trialId: 'TRL-001',
      participantId: 'P-01',
      caseId: 'EVAL-CASE-A',
      interfaceType: 'interactive',
      startedAt: '2026-11-27T10:00:00Z',
      completedAt: '2026-11-27T10:01:15Z',
      elapsedSeconds: 75,
      selectedCandidateId: 'CAND-A-SWAP',
      testedCutoff: '16:30',
      isCorrectOptimal: true,
      isAcceptable: false,
      brokeDonorPromise: false,
      perceivedControlScore: 5,
      easeOfUnderstandingScore: 5,
      confidenceScore: 5
    };
    adapter.submitTrial(sub1);

    const sub2: TrialSubmission = {
      trialId: 'TRL-002',
      participantId: 'P-01',
      caseId: 'EVAL-CASE-B',
      interfaceType: 'text_baseline',
      startedAt: '2026-11-27T10:02:00Z',
      completedAt: '2026-11-27T10:03:50Z',
      elapsedSeconds: 110,
      selectedCandidateId: 'CAND-B-SPARE',
      testedCutoff: '11:30',
      isCorrectOptimal: false,
      isAcceptable: true,
      brokeDonorPromise: false,
      perceivedControlScore: 3,
      easeOfUnderstandingScore: 3,
      confidenceScore: 4
    };
    adapter.submitTrial(sub2);

    // Participant 2 (Group B): completes Trial 1 (Unsafe cutoff failure) and Trial 2 (Optimal)
    adapter.getOrCreateSession('P-02');
    const sub3: TrialSubmission = {
      trialId: 'TRL-003',
      participantId: 'P-02',
      caseId: 'EVAL-CASE-B',
      interfaceType: 'text_baseline',
      startedAt: '2026-11-27T10:10:00Z',
      completedAt: '2026-11-27T10:12:30Z',
      elapsedSeconds: 150,
      selectedCandidateId: 'CAND-B-SWAP',
      testedCutoff: '12:00', // Unsafe: required 13:30
      isCorrectOptimal: false,
      isAcceptable: false,
      brokeDonorPromise: true,
      perceivedControlScore: 2,
      easeOfUnderstandingScore: 2,
      confidenceScore: 2
    };
    adapter.submitTrial(sub3);

    const sub4: TrialSubmission = {
      trialId: 'TRL-004',
      participantId: 'P-02',
      caseId: 'EVAL-CASE-A',
      interfaceType: 'interactive',
      startedAt: '2026-11-27T10:13:00Z',
      completedAt: '2026-11-27T10:14:05Z',
      elapsedSeconds: 65,
      selectedCandidateId: 'CAND-A-SWAP',
      testedCutoff: '16:30',
      isCorrectOptimal: true,
      isAcceptable: false,
      brokeDonorPromise: false,
      perceivedControlScore: 5,
      easeOfUnderstandingScore: 5,
      confidenceScore: 5
    };
    adapter.submitTrial(sub4);

    const allSubs = adapter.listSubmissions();
    assert.equal(allSubs.length, 4);

    const summary = computeStudySummary(allSubs);
    assert.equal(summary.totalParticipants, 2);
    assert.equal(summary.completedSessions, 2);
    assert.equal(summary.interfaceOrderBreakdown.interactiveFirstCount, 1);
    assert.equal(summary.interfaceOrderBreakdown.textFirstCount, 1);

    // Interactive condition performance (faster, higher accuracy, higher control)
    assert.equal(summary.metricsByInterface.interactive.averageElapsedSeconds, 70); // (75 + 65) / 2
    assert.equal(summary.metricsByInterface.interactive.optimalDecisionRate, 100);
    assert.equal(summary.metricsByInterface.interactive.brokenDonorPromiseRate, 0);
    assert.equal(summary.metricsByInterface.interactive.averagePerceivedControl, 5.0);

    // Text baseline performance
    assert.equal(summary.metricsByInterface.text_baseline.averageElapsedSeconds, 130); // (110 + 150) / 2
    assert.equal(summary.metricsByInterface.text_baseline.brokenDonorPromiseRate, 50); // 1 out of 2

    // Check failure log
    assert.equal(summary.failures.length, 1);
    assert.equal(summary.failures[0].participantId, 'P-02');
    assert.equal(summary.failures[0].interfaceType, 'text_baseline');
    assert.ok(summary.failures[0].failureReason.includes('donor'));
  });

  test('ES-04: Isolated reset clears study records without affecting seed data', () => {
    adapter.getOrCreateSession('P-TEST');
    adapter.submitTrial({
      trialId: 'TRL-X',
      participantId: 'P-TEST',
      caseId: 'EVAL-CASE-A',
      interfaceType: 'interactive',
      startedAt: '2026-11-27T10:00:00Z',
      completedAt: '2026-11-27T10:01:00Z',
      elapsedSeconds: 60,
      selectedCandidateId: 'CAND-A-SWAP',
      testedCutoff: '16:00',
      isCorrectOptimal: true,
      isAcceptable: false,
      brokeDonorPromise: false,
      perceivedControlScore: 5,
      easeOfUnderstandingScore: 5,
      confidenceScore: 5
    });

    assert.equal(adapter.listSubmissions().length, 1);

    // Reset
    resetEvaluationStore();
    assert.equal(adapter.listSubmissions().length, 0);
  });
});
