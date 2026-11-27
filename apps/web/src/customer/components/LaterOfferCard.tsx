import React from 'react';
import { CustomerOrder, OfferProposal, CustomerDecision } from '../types/order.ts';
import { ClockIcon, CheckIcon, ArrowRightIcon, TruckIcon, AlertIcon } from '../../shared/icons.tsx';
import { getUnitLabel, formatDateString, formatDayOfWeek } from '../utils/formatters.ts';

interface LaterOfferCardProps {
  order: CustomerOrder;
  offer: OfferProposal;
  onDecision: (decision: CustomerDecision) => Promise<void>;
  isSubmitting?: boolean;
}

export const LaterOfferCard: React.FC<LaterOfferCardProps> = ({
  order,
  offer,
  onDecision,
  isSubmitting = false
}) => {
  const shipment = offer.proposedShipments[0] || {
    quantity: order.requestedDetails.quantity,
    arrivalDate: '2026-12-01',
    originWarehouse: 'Regional Consolidated Hub',
    destination: order.requestedDetails.destination,
    statusText: 'Proposed: Single consignment following buffer replenishment'
  };

  const unitLabel = getUnitLabel(order.requestedDetails.itemSku, order.requestedDetails.itemName);
  const unitLabelUpper = getUnitLabel(order.requestedDetails.itemSku, order.requestedDetails.itemName, true);
  const laterDateFormatted = formatDateString(shipment.arrivalDate);
  const laterDay = formatDayOfWeek(shipment.arrivalDate);
  const reqDay = formatDayOfWeek(order.requestedDetails.requestedArrivalDate);

  return (
    <div className="ruled-box" style={{ background: 'var(--surface)', border: '1px solid var(--rule)' }}>
      {/* Banner */}
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
            SINGLE CONSIGNMENT REVISED SCHEDULE · NOT YET AGREED
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
          OFFER #{offer.offerId} (REV-{offer.version})
        </div>
      </div>

      <div style={{ padding: '1.5rem 1.25rem' }}>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '0.95rem', marginBottom: '1.25rem' }}>
          To deliver all <strong>{shipment.quantity} {unitLabel} together in one single consignment</strong>, dispatch is scheduled following consolidation from regional stock buffers.
        </p>

        {/* The Single Ruled Shipment Row */}
        <div style={{
          border: '2px solid var(--ink)',
          marginBottom: '1.5rem',
          background: 'var(--surface)'
        }}>
          <div
            className="split-offer-row"
            style={{
              padding: '1.35rem 1.25rem'
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.15rem' }}>
                Consolidated Shipment
              </div>
              <div className="tabular" style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2.25rem',
                fontWeight: 700,
                lineHeight: 1,
                color: 'var(--ink)'
              }}>
                {shipment.quantity} {unitLabelUpper}
              </div>
            </div>

            <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: 'var(--oxide-red)',
                  textTransform: 'uppercase'
                }}>
                  {laterDateFormatted}
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--amber-subtle)',
                  color: 'var(--amber-warning)',
                  padding: '0.1rem 0.35rem',
                  border: '1px solid var(--amber-warning)'
                }}>
                  PROPOSED LATER ARRIVAL
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', fontSize: '0.85rem', color: 'var(--ink-secondary)' }}>
                <TruckIcon size={14} color="var(--ink-muted)" />
                <span>{shipment.originWarehouse} → {order.requestedDetails.destination}</span>
              </div>

              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', marginTop: '0.2rem' }}>
                {shipment.statusText}
              </div>
            </div>
          </div>
        </div>

        {/* Explicit Warning: Decline vs Acceptance */}
        <div style={{
          padding: '0.85rem 1rem',
          border: '1px solid var(--rule)',
          background: 'var(--surface-subtle)',
          marginBottom: '1.75rem',
          fontSize: '0.85rem',
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'flex-start'
        }}>
          <AlertIcon size={16} color="var(--ink-muted)" />
          <div style={{ color: 'var(--ink-secondary)' }}>
            <strong>Terms note:</strong> Rejecting a split delivery does not automatically accept this later date. You must explicitly click below to agree to arrival on <strong>{laterDateFormatted}</strong>.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <button
            type="button"
            className="btn-primary"
            disabled={isSubmitting}
            onClick={() => onDecision('accept_later')}
            style={{
              width: '100%',
              padding: '1rem 1.25rem',
              fontSize: '1.05rem',
              justifyContent: 'center'
            }}
          >
            <CheckIcon size={18} color="var(--surface)" />
            <span>Accept Later Single Delivery (All {shipment.quantity} on {laterDay})</span>
          </button>

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
              onClick={() => onDecision('insist_original')}
              style={{
                fontSize: '0.9rem',
                padding: '0.75rem 1rem',
                justifyContent: 'space-between',
                color: 'var(--oxide-red)'
              }}
            >
              <span>Keep all {order.requestedDetails.quantity} together by {reqDay} (Insist)</span>
              <ArrowRightIcon size={14} />
            </button>

            <button
              type="button"
              className="btn-secondary"
              disabled={isSubmitting}
              onClick={() => onDecision('decline')}
              style={{
                fontSize: '0.9rem',
                padding: '0.75rem 1rem',
                justifyContent: 'space-between'
              }}
            >
              <span>Decline and review options</span>
              <ArrowRightIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
