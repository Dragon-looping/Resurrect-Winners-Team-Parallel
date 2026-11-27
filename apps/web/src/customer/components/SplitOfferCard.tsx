import React from 'react';
import { CustomerOrder, OfferProposal, CustomerDecision } from '../types/order.ts';
import { ClockIcon, CheckIcon, ArrowRightIcon, TruckIcon } from '../../shared/icons.tsx';

interface SplitOfferCardProps {
  order: CustomerOrder;
  offer: OfferProposal;
  onDecision: (decision: CustomerDecision) => Promise<void>;
  isSubmitting?: boolean;
}

export const SplitOfferCard: React.FC<SplitOfferCardProps> = ({
  order,
  offer,
  onDecision,
  isSubmitting = false
}) => {
  const shipments = offer.proposedShipments;

  return (
    <div className="ruled-box" style={{ background: 'var(--surface)', border: '1px solid var(--rule)' }}>
      {/* Signature Proposal Notice Banner */}
      <div style={{
        padding: '0.85rem 1.25rem',
        background: 'var(--amber-subtle)',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ClockIcon size={16} color="var(--amber-warning)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--amber-warning)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            PROPOSED ALLOCATION · NOT YET AGREED
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
          OFFER #{offer.offerId} (REV-{offer.version})
        </div>
      </div>

      <div style={{ padding: '1.5rem 1.25rem' }}>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '0.95rem', marginBottom: '1.25rem' }}>
          Warehouse physical reconciliation at Udupi confirmed <strong>40 fans</strong> available for immediate Friday dispatch. The remaining <strong>10 fans</strong> are staged from the regional buffer for Sunday delivery.
        </p>

        {/* The Signature Two-Row Ruled List */}
        <div style={{
          border: '2px solid var(--ink)',
          marginBottom: '1.75rem',
          background: 'var(--canvas)'
        }}>
          {shipments.map((shp, index) => {
            const isFirst = index === 0;
            return (
              <div
                key={shp.shipmentId}
                className="split-offer-row"
                style={{
                  padding: '1.25rem 1.25rem',
                  borderBottom: isFirst ? '2px solid var(--ink)' : 'none',
                  background: isFirst ? 'var(--surface)' : 'var(--surface-subtle)'
                }}
              >
                {/* Quantity Block (Bold & Tabular) */}
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.15rem' }}>
                    Shipment {index + 1} of 2
                  </div>
                  <div className="tabular" style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '2rem',
                    fontWeight: 700,
                    lineHeight: 1,
                    color: 'var(--ink)'
                  }}>
                    {shp.quantity} FANS
                  </div>
                </div>

                {/* Date & Destination Details */}
                <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.35rem',
                      fontWeight: 700,
                      color: isFirst ? 'var(--oxide-red)' : 'var(--ink)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.01em'
                    }}>
                      {isFirst ? 'Fri, Nov 27, 2026' : 'Sun, Nov 29, 2026'}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--amber-subtle)',
                      color: 'var(--amber-warning)',
                      padding: '0.1rem 0.35rem',
                      border: '1px solid var(--amber-warning)'
                    }}>
                      PROPOSED DATE
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', fontSize: '0.85rem', color: 'var(--ink-secondary)' }}>
                    <TruckIcon size={14} color="var(--ink-muted)" />
                    <span>{shp.originWarehouse} → {order.requestedDetails.destination}</span>
                  </div>

                  <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', marginTop: '0.2rem' }}>
                    {shp.statusText}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Comparison with Original Request */}
        <div style={{
          padding: '0.85rem 1rem',
          border: '1px solid var(--rule)',
          background: 'var(--surface)',
          marginBottom: '1.75rem',
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ color: 'var(--ink-muted)' }}>
              Requested: <strong style={{ color: 'var(--ink)' }}>All 50 fans by Friday, Nov 27</strong>
            </span>
            <span style={{ color: 'var(--ink-muted)' }}>
              Offered: <strong style={{ color: 'var(--oxide-red)' }}>40 on Fri + 10 on Sun (100% fulfilled)</strong>
            </span>
          </div>
        </div>

        {/* Consequential Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Primary Action: Accept Split */}
          <button
            type="button"
            className="btn-primary"
            disabled={isSubmitting}
            onClick={() => onDecision('accept_split')}
            style={{
              width: '100%',
              padding: '1rem 1.25rem',
              fontSize: '1.05rem',
              letterSpacing: '0.02em',
              justifyContent: 'center',
              boxShadow: 'none'
            }}
          >
            <CheckIcon size={18} color="var(--surface)" />
            <span>Accept Split Delivery (40 on Friday + 10 on Sunday)</span>
          </button>

          {/* Secondary Alternative Choices */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '0.75rem',
            marginTop: '0.25rem'
          }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={isSubmitting}
              onClick={() => onDecision('accept_later')}
              style={{
                fontSize: '0.9rem',
                padding: '0.75rem 1rem',
                justifyContent: 'space-between',
                textAlign: 'left'
              }}
            >
              <span>Consider later single delivery (All 50 on Tue)</span>
              <ArrowRightIcon size={14} />
            </button>

            <button
              type="button"
              className="btn-secondary"
              disabled={isSubmitting}
              onClick={() => onDecision('insist_original')}
              style={{
                fontSize: '0.9rem',
                padding: '0.75rem 1rem',
                justifyContent: 'space-between',
                textAlign: 'left',
                color: 'var(--oxide-red)',
                borderColor: 'var(--rule-dark)'
              }}
            >
              <span>Keep all 50 together by Friday (Insist)</span>
              <ArrowRightIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
