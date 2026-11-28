import React, { useState } from 'react';
import { getPlannerAdapter, getPlannerConfig } from '../adapters/plannerAdapter.ts';
import { PlannerOrder } from '../types/planner.ts';
import { CheckIcon, AlertIcon } from '../../shared/icons.tsx';

interface PurchasingReviewPanelProps {
  order: PlannerOrder;
  onActionComplete: () => void;
  onError: (msg: string) => void;
}

function inr(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

export const PurchasingReviewPanel: React.FC<PurchasingReviewPanelProps> = ({
  order,
  onActionComplete,
  onError
}) => {
  const { purchasing } = order;

  const [approverName, setApproverName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // PO creation: show a preview step before final submission
  const [showPoPreview, setShowPoPreview] = useState(false);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);

  const noShortage = purchasing.shortageUnits === 0;
  const hasPo = !!purchasing.poReceipt;
  const hasEmail = !!purchasing.emailReceipt;

  async function handleCreatePo() {
    if (!approverName.trim()) {
      setActionError('Approver name is required.');
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    try {
      await getPlannerAdapter().createPurchaseOrder(order.orderId, approverName.trim());
      setShowPoPreview(false);
      onActionComplete();
    } catch (err: any) {
      const msg = err.message || 'PO creation failed.';
      setActionError(msg);
      onError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendEmail() {
    if (!approverName.trim()) {
      setActionError('Approver name is required.');
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    try {
      await getPlannerAdapter().sendSupplierEmail(order.orderId, approverName.trim());
      setShowEmailConfirm(false);
      onActionComplete();
    } catch (err: any) {
      const msg = err.message || 'Email dispatch failed.';
      setActionError(msg);
      onError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
          Purchasing Review
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
          PO creation and email dispatch each require a separate explicit approval.
        </p>
        {getPlannerConfig().mode === 'live' && (
          <div style={{ marginTop: '0.5rem', padding: '0.45rem 0.65rem', background: 'var(--surface-subtle)', border: '1px dashed var(--rule-dark)', color: 'var(--ink-muted)', fontSize: '0.78rem' }}>
            ℹ Unavailable in Live mode: PO approval and supplier dispatches require Person 4 procurement workflow.
          </div>
        )}
      </div>

      {/* Shortage info */}
      {noShortage ? (
        <div style={{ padding: '0.9rem', background: 'var(--forest-green-subtle)', border: '1px solid var(--forest-green)', display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '1.25rem' }}>
          <CheckIcon size={18} color="var(--forest-green)" />
          <span style={{ fontWeight: 700, color: 'var(--forest-green)' }}>No shortage — no PO required for this order.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Shortage ID', value: purchasing.shortageId },
            { label: 'SKU', value: purchasing.sku },
            { label: 'Item', value: purchasing.itemName },
            { label: 'Shortage Units', value: String(purchasing.shortageUnits), tabular: true, urgent: true },
            { label: 'Batch Code', value: purchasing.batchCode },
            { label: 'Supplier', value: purchasing.supplierName },
            { label: 'Supplier Email', value: purchasing.supplierEmail },
            { label: 'Supplier ETA', value: purchasing.supplierEta },
            { label: 'Unit Price', value: inr(purchasing.unitPriceInr), tabular: true },
            { label: 'Total Price', value: inr(purchasing.totalPriceInr), tabular: true, bold: true },
            { label: 'Evidence', value: purchasing.evidenceCitation }
          ].map(({ label, value, tabular, urgent, bold }) => (
            <div key={label} style={{ padding: '0.65rem 0.75rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{label}</p>
              <p style={{ fontSize: '0.9rem', fontWeight: bold ? 700 : 600, fontVariantNumeric: tabular ? 'tabular-nums' : 'normal', color: urgent ? 'var(--oxide-red)' : 'var(--ink)' }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {actionError && (
        <div style={{ padding: '0.75rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', color: 'var(--oxide-red)', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertIcon size={16} color="var(--oxide-red)" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Approver name — shared for both actions */}
      {!noShortage && (
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-secondary)', marginBottom: '0.3rem' }}>
            Approver Name * (required for both PO and email)
          </label>
          <input
            type="text"
            value={approverName}
            onChange={e => setApproverName(e.target.value)}
            placeholder="Your name"
            disabled={isSubmitting || (hasPo && hasEmail)}
            style={{ width: '100%', maxWidth: '320px', padding: '0.45rem 0.6rem', border: '1px solid var(--rule)', background: 'var(--surface)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', boxSizing: 'border-box' }}
          />
        </div>
      )}

      {/* PO Creation */}
      {!noShortage && (
        <div style={{ padding: '1rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)', marginBottom: '1.25rem' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            Step 1 · Create Purchase Order
          </p>

          {hasPo ? (
            <div style={{ padding: '0.75rem', background: 'var(--forest-green-subtle)', border: '1px solid var(--forest-green)', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <CheckIcon size={16} color="var(--forest-green)" />
              <div>
                <p style={{ fontWeight: 700, color: 'var(--forest-green)', fontSize: '0.88rem' }}>PO Created</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {purchasing.poReceipt!.poNumber} · Approved by {purchasing.poReceipt!.approvedBy} at {purchasing.poReceipt!.approvedAt}
                </p>
              </div>
            </div>
          ) : showPoPreview ? (
            <div>
              <div style={{ padding: '0.9rem', background: 'var(--surface)', border: '1px solid var(--rule)', marginBottom: '0.75rem' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>PO Preview</p>
                <p><strong>Item:</strong> {purchasing.itemName} ({purchasing.sku})</p>
                <p><strong>Quantity:</strong> {purchasing.shortageUnits} units</p>
                <p><strong>Supplier:</strong> {purchasing.supplierName}</p>
                <p><strong>Total:</strong> {inr(purchasing.totalPriceInr)}</p>
                <p><strong>Approver:</strong> {approverName}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleCreatePo}
                  disabled={isSubmitting}
                  style={{ padding: '0.5rem 1.25rem', opacity: isSubmitting ? 0.5 : 1 }}
                >
                  {isSubmitting ? 'Creating PO…' : 'Confirm: Create PO'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowPoPreview(false)}
                  disabled={isSubmitting}
                  style={{ padding: '0.5rem 1.25rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setActionError(null);
                if (!approverName.trim()) { setActionError('Approver name is required.'); return; }
                setShowPoPreview(true);
              }}
              disabled={isSubmitting}
              style={{ padding: '0.5rem 1.25rem' }}
            >
              Create Purchase Order…
            </button>
          )}
        </div>
      )}

      {/* Email dispatch */}
      {!noShortage && (
        <div style={{ padding: '1rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)', marginBottom: '1.25rem' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            Step 2 · Send Supplier Email
          </p>

          {hasEmail ? (
            <div style={{ padding: '0.75rem', background: 'var(--forest-green-subtle)', border: '1px solid var(--forest-green)', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <CheckIcon size={16} color="var(--forest-green)" />
              <div>
                <p style={{ fontWeight: 700, color: 'var(--forest-green)', fontSize: '0.88rem' }}>Email Sent</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {purchasing.emailReceipt!.messageId} → {purchasing.emailReceipt!.sentTo} at {purchasing.emailReceipt!.sentAt}
                </p>
              </div>
            </div>
          ) : !hasPo ? (
            <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
              Create the PO first before sending the supplier email.
            </p>
          ) : showEmailConfirm ? (
            <div>
              <div style={{ padding: '0.9rem', background: 'var(--surface)', border: '1px solid var(--rule)', marginBottom: '0.75rem' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Email Preview</p>
                <p><strong>To:</strong> {purchasing.supplierEmail}</p>
                <p><strong>Subject:</strong> PO {purchasing.poReceipt?.poNumber} — {purchasing.itemName}</p>
                <p><strong>Sent by:</strong> {approverName}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSendEmail}
                  disabled={isSubmitting}
                  style={{ padding: '0.5rem 1.25rem', opacity: isSubmitting ? 0.5 : 1 }}
                >
                  {isSubmitting ? 'Sending…' : 'Confirm: Send Email'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowEmailConfirm(false)}
                  disabled={isSubmitting}
                  style={{ padding: '0.5rem 1.25rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setActionError(null);
                if (!approverName.trim()) { setActionError('Approver name is required.'); return; }
                setShowEmailConfirm(true);
              }}
              disabled={isSubmitting || !hasPo}
              style={{ padding: '0.5rem 1.25rem', opacity: (!hasPo) ? 0.5 : 1, cursor: !hasPo ? 'not-allowed' : 'pointer' }}
            >
              Send Supplier Email…
            </button>
          )}
        </div>
      )}
    </section>
  );
};
