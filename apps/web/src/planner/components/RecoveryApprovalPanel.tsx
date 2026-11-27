import React, { useState } from 'react';
import { getPlannerAdapter } from '../adapters/plannerAdapter.ts';
import { CutoffPreviewResult, PlannerOrder } from '../types/planner.ts';
import { CheckIcon, AlertIcon } from '../../shared/icons.tsx';

interface RecoveryApprovalPanelProps {
  order: PlannerOrder;
  cutoffPreview: CutoffPreviewResult | null;
  onActionComplete: () => void;
  onError: (msg: string) => void;
}

export const RecoveryApprovalPanel: React.FC<RecoveryApprovalPanelProps> = ({
  order,
  cutoffPreview,
  onActionComplete,
  onError
}) => {
  const [approverName, setApproverName] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [delayNote, setDelayNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedCandidate = order.candidates.find(
    c => c.candidateId === order.selectedCandidateId
  );

  const isResolved = order.riskStatus === 'resolved' || order.riskStatus === 'unavoidable_delay';
  const hasPreview = !!cutoffPreview;
  const previewStale = hasPreview && cutoffPreview!.previewVersion !== order.version;
  const previewInfeasible = hasPreview && !cutoffPreview!.feasible;
  const candidateInfeasible = selectedCandidate && !selectedCandidate.feasible;
  const allCandidatesInfeasible = order.candidates.every(c => !c.feasible);

  const approvalBlocked = candidateInfeasible || previewInfeasible || previewStale;

  async function handleApprove() {
    if (!approverName.trim()) {
      setActionError('Approver name is required.');
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    try {
      await getPlannerAdapter().approveRecovery(
        order.orderId,
        order.selectedCandidateId,
        order.version,
        cutoffPreview ?? undefined
      );
      onActionComplete();
    } catch (err: any) {
      const msg = err.message || 'Approval failed.';
      setActionError(msg);
      onError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReject() {
    if (!rejectionReason.trim()) {
      setActionError('Rejection reason is required.');
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    try {
      await getPlannerAdapter().rejectRecovery(order.orderId, rejectionReason.trim(), order.version);
      onActionComplete();
    } catch (err: any) {
      const msg = err.message || 'Rejection failed.';
      setActionError(msg);
      onError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUnavoidableDelay() {
    if (!delayNote.trim()) {
      setActionError('Delay explanation is required.');
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    try {
      await getPlannerAdapter().recordUnavoidableDelay(order.orderId, delayNote.trim(), order.version);
      onActionComplete();
    } catch (err: any) {
      const msg = err.message || 'Could not record delay.';
      setActionError(msg);
      onError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ── Receipts: show when actions are already recorded ── */
  if (order.approvedCandidateId) {
    return (
      <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Recovery Approved
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.9rem', background: 'var(--forest-green-subtle)', border: '1px solid var(--forest-green)' }}>
          <CheckIcon size={18} color="var(--forest-green)" />
          <span style={{ fontWeight: 700, color: 'var(--forest-green)' }}>
            APPROVED · Candidate {order.approvedCandidateId}
          </span>
        </div>
        {order.riskStatus === 'resolved' && (
          <p style={{ marginTop: '0.75rem', color: 'var(--ink-secondary)', fontSize: '0.85rem' }}>
            Order status resolved. Backlog cleared.
          </p>
        )}
      </section>
    );
  }

  if (order.rejectionReason) {
    return (
      <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Recovery Rejected
          </h2>
        </div>
        <div style={{ padding: '0.9rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', color: 'var(--oxide-red)', fontWeight: 600 }}>
          REJECTED: {order.rejectionReason}
        </div>
      </section>
    );
  }

  if (order.unavoidableDelayNote) {
    return (
      <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Unavoidable Delay Recorded
          </h2>
        </div>
        <div style={{ padding: '0.9rem', background: '#fff8e1', border: '1px solid #f59e0b', color: '#92400e', fontWeight: 600 }}>
          DELAY NOTE: {order.unavoidableDelayNote}
        </div>
      </section>
    );
  }

  return (
    <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
          Recovery Approval
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
          Version {order.version}. Approval, rejection, and delay are version-locked — a stale view is blocked.
        </p>
      </div>

      {actionError && (
        <div style={{ padding: '0.75rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', color: 'var(--oxide-red)', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertIcon size={16} color="var(--oxide-red)" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Selected candidate info */}
      {selectedCandidate && (
        <div style={{ padding: '0.9rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)', marginBottom: '1.25rem' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Selected Recovery Candidate</p>
          <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem' }}>{selectedCandidate.title}</p>
          <p style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)', marginBottom: '0.5rem' }}>{selectedCandidate.summary}</p>
          <div style={{ display: 'inline-block', padding: '0.2rem 0.6rem', fontSize: '0.74rem', fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', background: selectedCandidate.feasible ? 'var(--forest-green-subtle)' : 'var(--oxide-red-subtle)', color: selectedCandidate.feasible ? 'var(--forest-green)' : 'var(--oxide-red)', border: `1px solid ${selectedCandidate.feasible ? 'var(--forest-green)' : 'var(--oxide-red)'}` }}>
            {selectedCandidate.feasible ? 'FEASIBLE' : 'INFEASIBLE'}
          </div>
        </div>
      )}

      {/* Stale preview warning */}
      {previewStale && (
        <div style={{ padding: '0.75rem', background: '#fff8e1', border: '1px solid #f59e0b', color: '#92400e', marginBottom: '1rem', fontWeight: 600 }}>
          ⚠ STALE PREVIEW — Cutoff simulation is from an older version. Refresh the cutoff simulation before approving.
        </div>
      )}

      {/* Infeasible preview block */}
      {!previewStale && previewInfeasible && (
        <div style={{ padding: '0.75rem', background: 'var(--oxide-red-subtle)', border: '2px solid var(--oxide-red)', color: 'var(--oxide-red)', marginBottom: '1rem', fontWeight: 700 }}>
          ✗ APPROVAL BLOCKED — Cutoff simulation is infeasible: {cutoffPreview!.unsafeReason}
        </div>
      )}

      {/* Infeasible candidate block */}
      {!previewStale && !previewInfeasible && candidateInfeasible && (
        <div style={{ padding: '0.75rem', background: 'var(--oxide-red-subtle)', border: '2px solid var(--oxide-red)', color: 'var(--oxide-red)', marginBottom: '1rem', fontWeight: 700 }}>
          ✗ APPROVAL BLOCKED — {selectedCandidate?.infeasibilityReason || 'Selected candidate is not feasible.'}
        </div>
      )}

      {/* Approve section */}
      {!allCandidatesInfeasible && (
        <div style={{ padding: '1rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)', marginBottom: '1.25rem' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Approve Recovery</p>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-secondary)', marginBottom: '0.3rem' }}>
                Approver Name *
              </label>
              <input
                type="text"
                value={approverName}
                onChange={e => setApproverName(e.target.value)}
                placeholder="Your name"
                disabled={isSubmitting || isResolved}
                style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid var(--rule)', background: 'var(--surface)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleApprove}
              disabled={isSubmitting || approvalBlocked || isResolved}
              style={{ padding: '0.5rem 1.25rem', opacity: (isSubmitting || approvalBlocked || isResolved) ? 0.5 : 1, cursor: (isSubmitting || approvalBlocked || isResolved) ? 'not-allowed' : 'pointer' }}
            >
              {isSubmitting ? 'Approving…' : 'Approve Recovery'}
            </button>
          </div>
          {approvalBlocked && (
            <p style={{ fontSize: '0.78rem', color: 'var(--oxide-red)', marginTop: '0.4rem' }}>
              Fix the issues above before approving.
            </p>
          )}
        </div>
      )}

      {/* Reject section */}
      <div style={{ padding: '1rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)', marginBottom: '1.25rem' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Reject Recovery</p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-secondary)', marginBottom: '0.3rem' }}>
              Rejection Reason *
            </label>
            <input
              type="text"
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="Explain why the plan is rejected"
              disabled={isSubmitting || isResolved}
              style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid var(--rule)', background: 'var(--surface)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleReject}
            disabled={isSubmitting || isResolved}
            style={{ padding: '0.5rem 1.25rem', opacity: (isSubmitting || isResolved) ? 0.5 : 1, cursor: (isSubmitting || isResolved) ? 'not-allowed' : 'pointer' }}
          >
            {isSubmitting ? 'Rejecting…' : 'Reject Recovery'}
          </button>
        </div>
      </div>

      {/* Unavoidable Delay section — always visible for infeasible-only orders */}
      {allCandidatesInfeasible && (
        <div style={{ padding: '1rem', background: '#fff8e1', border: '1px solid #f59e0b', marginBottom: '1.25rem' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#92400e', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
            Record Unavoidable Delay
          </p>
          <p style={{ fontSize: '0.82rem', color: '#92400e', marginBottom: '0.75rem' }}>
            All recovery candidates are infeasible. Record a delay note to close this order gracefully.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#92400e', marginBottom: '0.3rem' }}>
                Delay Explanation *
              </label>
              <input
                type="text"
                value={delayNote}
                onChange={e => setDelayNote(e.target.value)}
                placeholder="No swap donor available; replenishment delayed"
                disabled={isSubmitting || isResolved}
                style={{ width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #f59e0b', background: 'var(--surface)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="button"
              onClick={handleUnavoidableDelay}
              disabled={isSubmitting || isResolved}
              style={{ padding: '0.5rem 1.25rem', background: '#f59e0b', color: '#fff', fontWeight: 700, border: 'none', cursor: (isSubmitting || isResolved) ? 'not-allowed' : 'pointer', opacity: (isSubmitting || isResolved) ? 0.5 : 1, fontFamily: 'var(--font-body)' }}
            >
              {isSubmitting ? 'Recording…' : 'Record Unavoidable Delay'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
