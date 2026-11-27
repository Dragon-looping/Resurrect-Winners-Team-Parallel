import React from 'react';
import { CustomerOrder, OfferProposal } from '../types/order.ts';
import { ClockIcon, RotateCcwIcon, AlertIcon } from '../../shared/icons.tsx';
import { getUnitLabel } from '../utils/formatters.ts';

interface ExpiredOfferCardProps {
  order: CustomerOrder;
  offer?: OfferProposal;
  onRefresh: () => Promise<void>;
  isSubmitting?: boolean;
}

export const ExpiredOfferCard: React.FC<ExpiredOfferCardProps> = ({
  order,
  offer,
  onRefresh,
  isSubmitting = false
}) => {
  const sku = order.requestedDetails.itemSku;
  const itemName = order.requestedDetails.itemName;
  const unitLabel = getUnitLabel(sku, itemName, false);
  const unitLabelTitle = unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1);

  return (
    <div className="ruled-box" style={{ background: 'var(--surface)', borderLeft: '4px solid var(--ink-muted)' }}>
      {/* Banner */}
      <div style={{
        padding: '0.85rem 1.25rem',
        background: 'var(--surface-subtle)',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ClockIcon size={16} color="var(--ink-muted)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ALLOCATION WINDOW EXPIRED
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-faint)' }}>
          OFFER #{offer?.offerId || 'STALE'}
        </div>
      </div>

      <div style={{ padding: '1.5rem 1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Proposal Expired
        </h2>

        <p style={{ color: 'var(--ink-secondary)', fontSize: '0.95rem', marginBottom: '1.25rem' }}>
          Logistics proposals are held for 30 minutes to reserve physical warehouse stock for {order.requestedDetails.quantity} {unitLabel}. Because this window elapsed, the reserved allocation was released to regional queueing.
        </p>

        {/* Expired proposal rows (disabled/faded to indicate stale state) */}
        {offer && (
          <div style={{ border: '1px solid var(--rule-dark)', padding: '1rem', background: 'var(--canvas)', marginBottom: '1.5rem', opacity: 0.75 }}>
            <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              Expired Proposal Snapshot:
            </div>
            {offer.proposedShipments.map((shp, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.25rem 0', borderBottom: i === 0 ? '1px dashed var(--rule)' : 'none' }}>
                <span className="tabular" style={{ fontWeight: 600 }}>{shp.quantity} {unitLabelTitle}</span>
                <span style={{ color: 'var(--ink-secondary)' }}>Arrival: {shp.arrivalDate}</span>
                <span style={{ color: 'var(--ink-muted)', fontStyle: 'italic' }}>Window Closed</span>
              </div>
            ))}
          </div>
        )}

        <div style={{
          padding: '1rem',
          background: 'var(--amber-subtle)',
          border: '1px solid var(--amber-warning)',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center'
        }}>
          <AlertIcon size={18} color="var(--amber-warning)" />
          <div style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
            <strong>Action required:</strong> Request a fresh allocation check. The dispatch engine will re-evaluate warehouse count and generate updated proposal dates.
          </div>
        </div>

        {/* Re-request Action */}
        <div>
          <button
            type="button"
            className="btn-primary"
            disabled={isSubmitting}
            onClick={onRefresh}
            style={{ width: '100%', padding: '0.9rem', justifyContent: 'center', fontSize: '1rem' }}
          >
            <RotateCcwIcon size={16} />
            <span>{isSubmitting ? 'Querying Live Allocation...' : 'Request Fresh Stock Schedule'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
