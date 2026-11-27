import React from 'react';
import { PlannerOrder } from '../types/planner.ts';
import { formatDateString } from '../../customer/utils/formatters.ts';
import { CheckIcon, ClockIcon, ShieldAlertIcon } from '../../shared/icons.tsx';

interface PlannerOffersPanelProps {
  order: PlannerOrder;
}

const RESPONSE_LABELS: Record<PlannerOrder['offerSummary']['customerResponse'], string> = {
  pending: 'CUSTOMER REPLY PENDING',
  accepted_split: 'ACCEPTED SPLIT DELIVERY',
  accepted_later: 'ACCEPTED LATER DELIVERY',
  insisted_original: 'INSISTED ON ORIGINAL TERMS',
  declined: 'DECLINED OFFER'
};

export const PlannerOffersPanel: React.FC<PlannerOffersPanelProps> = ({ order }) => {
  const { offerSummary, telemetry } = order;
  const isPending = offerSummary.customerResponse === 'pending';

  return (
    <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Customer Offer &amp; Promise State
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
            OFFER #{offerSummary.offerId} · TYPE: {offerSummary.offerType.toUpperCase()}
          </p>
        </div>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.25rem 0.6rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          fontWeight: 700,
          border: '1px solid var(--rule-dark)',
          background: isPending ? 'var(--amber-subtle)' : 'var(--surface-subtle)',
          color: isPending ? 'var(--amber-warning)' : 'var(--ink)'
        }}>
          {isPending ? <ClockIcon size={14} color="var(--amber-warning)" /> : <CheckIcon size={14} color="var(--forest-green)" />}
          <span>{RESPONSE_LABELS[offerSummary.customerResponse]}</span>
        </div>
      </div>

      {offerSummary.originalPromisePreserved && (
        <div style={{
          padding: '0.75rem 1rem',
          background: 'var(--surface-subtle)',
          borderLeft: '3px solid var(--ink)',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.85rem'
        }}>
          <ShieldAlertIcon size={16} color="var(--ink)" />
          <span>
            <strong>Original Promise Preserved:</strong> {order.quantity} {order.unitLabel} by{' '}
            <strong className="tabular">{telemetry.agreedArrival}</strong> remains binding while customer reply is {offerSummary.customerResponse}.
          </span>
        </div>
      )}

      <div style={{ border: '1px solid var(--rule)', marginBottom: '1rem' }}>
        {offerSummary.shipments.map((shp, idx) => (
          <div
            key={shp.shipmentId}
            style={{
              padding: '0.75rem 1rem',
              borderBottom: idx < offerSummary.shipments.length - 1 ? '1px solid var(--rule)' : 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              fontSize: '0.85rem'
            }}
          >
            <div className="tabular" style={{ fontWeight: 700 }}>
              {shp.quantity} {order.unitLabel.toUpperCase()} — {formatDateString(shp.arrivalDate)}
            </div>
            <div style={{ color: 'var(--ink-secondary)' }}>
              {shp.origin} → {shp.destination}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.8rem' }}>
        <span style={{ color: 'var(--ink-secondary)' }}>{offerSummary.notes}</span>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>PERMITTED:</span>
          {offerSummary.permittedPlannerActions.map(action => (
            <span
              key={action}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                padding: '0.15rem 0.45rem',
                border: '1px solid var(--rule-dark)',
                background: 'var(--canvas)'
              }}
            >
              {action}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
