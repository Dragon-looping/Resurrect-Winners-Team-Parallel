import React, { useState } from 'react';
import { CustomerOrder, CustomerDecision } from '../types/order.ts';
import { ClockIcon, AlertIcon, ArrowRightIcon, RefreshIcon } from '../../shared/icons.tsx';
import { getUnitLabel, formatDateString, formatDayOfWeek } from '../utils/formatters.ts';

interface RecoveryPendingCardProps {
  order: CustomerOrder;
  onDecision: (decision: CustomerDecision) => Promise<void>;
  onRefresh: () => Promise<void>;
  isSubmitting?: boolean;
}

export const RecoveryPendingCard: React.FC<RecoveryPendingCardProps> = ({
  order,
  onDecision,
  onRefresh,
  isSubmitting = false
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkFeedback, setCheckFeedback] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const unitLabel = getUnitLabel(order.requestedDetails.itemSku, order.requestedDetails.itemName);
  const reqDay = formatDayOfWeek(order.requestedDetails.requestedArrivalDate);
  const reqDate = formatDateString(order.requestedDetails.requestedArrivalDate);

  // Sourced directly from backend-issued offers
  const splitOffer = order.availableOffers?.split || (order.activeOffer?.offerType === 'split' ? order.activeOffer : undefined);
  const laterOffer = order.availableOffers?.later || (order.activeOffer?.offerType === 'later' ? order.activeOffer : undefined);

  const hasFeasibleSplit = Boolean(splitOffer && splitOffer.proposedShipments && splitOffer.proposedShipments.length >= 2);
  const hasFeasibleLater = Boolean(laterOffer && laterOffer.proposedShipments && laterOffer.proposedShipments.length >= 1);

  const totalQty = order.requestedDetails.quantity;
  const stagedQty = hasFeasibleSplit ? splitOffer!.proposedShipments[0].quantity : 0;
  const shortfallQty = hasFeasibleSplit ? splitOffer!.proposedShipments[1].quantity : totalQty;
  const splitReqDay = hasFeasibleSplit ? formatDayOfWeek(splitOffer!.proposedShipments[0].arrivalDate) : reqDay;
  const splitLaterDay = hasFeasibleSplit ? formatDayOfWeek(splitOffer!.proposedShipments[1].arrivalDate) : '';

  const laterQty = hasFeasibleLater ? laterOffer!.proposedShipments[0].quantity : totalQty;
  const laterArrivalDate = hasFeasibleLater ? laterOffer!.proposedShipments[0].arrivalDate : '';
  const laterDay = hasFeasibleLater ? formatDayOfWeek(laterArrivalDate) : '';
  const laterDateStr = hasFeasibleLater ? formatDateString(laterArrivalDate) : '';

  const handleCheckStatus = async () => {
    setIsChecking(true);
    setCheckFeedback(null);
    setCheckError(null);
    try {
      await onRefresh();
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setCheckFeedback(`Checked just now (${nowStr}) — recovery still pending.`);
    } catch (err: any) {
      setCheckError(err?.message || 'Transfer check failed. Authoritative connection rechecked.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="ruled-box" style={{ background: 'var(--surface)', borderLeft: '4px solid var(--amber-warning)' }}>
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
            ORIGINAL TERMS INSISTED · SCANNING RECOVERY
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
          RECORDED AT {new Date(order.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div style={{ padding: '1.5rem 1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Checking recovery for {totalQty} {unitLabel} by {reqDay}
        </h2>

        <p style={{ color: 'var(--ink-secondary)', fontSize: '0.95rem', marginBottom: '1.25rem' }}>
          You have insisted on your original requirement: <strong>all {totalQty} {order.requestedDetails.itemName || unitLabel} delivered together by {reqDate}</strong>.
        </p>

        {/* Explicit Warning: DO NOT IMPLY THE SHORTFALL UNITS ARE FOUND */}
        <div style={{
          padding: '1rem',
          background: 'var(--surface-subtle)',
          border: '1px solid var(--rule)',
          marginBottom: '1.5rem',
          borderLeft: '3px solid var(--oxide-red)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <AlertIcon size={16} color="var(--oxide-red)" />
            <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '0.9rem' }}>
              Current Allocation Status: {shortfallQty} {unitLabel} Unallocated
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)' }}>
            Physical warehouse reconciliation verified {stagedQty} {unitLabel} staged. <strong>The remaining {shortfallQty} {unitLabel} have not been secured for {reqDay} arrival.</strong> The dispatch engine is actively checking inter-hub transfers from regional depots.
          </p>
        </div>

        {/* Ruled status indicators */}
        <div style={{ border: '1px solid var(--rule)', padding: '1rem', background: 'var(--canvas)', marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--ink-muted)' }}>1. Staged Inventory:</span>
            <span className="tabular" style={{ fontWeight: 600 }}>{stagedQty} {unitLabel} (Ready for {reqDay} dock)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--ink-muted)' }}>2. Shortfall Balance:</span>
            <span className="tabular" style={{ fontWeight: 600, color: 'var(--oxide-red)' }}>{shortfallQty} {unitLabel} (Pending inter-depot scan)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--ink-muted)' }}>3. Automated Sweep Target:</span>
            <span className="tabular" style={{ fontWeight: 600 }}>{reqDate} dock arrival</span>
          </div>
        </div>

        {/* Customer fallback options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={isChecking || isSubmitting}
            onClick={handleCheckStatus}
            style={{ width: '100%', padding: '0.85rem', justifyContent: 'center', fontSize: '0.9rem' }}
          >
            <RefreshIcon size={16} />
            <span>{isChecking ? 'Checking Inter-Hub Recovery...' : 'Check Inter-Hub Transfer Status Now'}</span>
          </button>

          {checkFeedback && (
            <div style={{
              padding: '0.65rem 0.85rem',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--amber-warning)',
              borderLeft: '3px solid var(--amber-warning)',
              fontSize: '0.85rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <ClockIcon size={14} color="var(--amber-warning)" />
              <span>{checkFeedback}</span>
            </div>
          )}

          {checkError && (
            <div style={{
              padding: '0.65rem 0.85rem',
              background: 'var(--oxide-red-subtle)',
              border: '1px solid var(--oxide-red)',
              borderLeft: '3px solid var(--oxide-red)',
              fontSize: '0.85rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--oxide-red)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertIcon size={14} color="var(--oxide-red)" />
              <span>Transfer check failed: {checkError}</span>
            </div>
          )}

          <div style={{ borderTop: '1px dashed var(--rule-dark)', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '0.6rem' }}>
              Alternatively, if you cannot wait for the inter-hub recovery scan:
            </p>
            {hasFeasibleSplit || hasFeasibleLater ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {hasFeasibleSplit ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isSubmitting || isChecking}
                    onClick={() => onDecision('accept_split')}
                    style={{ fontSize: '0.85rem', padding: '0.65rem 0.85rem', textAlign: 'left', justifyContent: 'space-between' }}
                  >
                    <span>Accept split schedule ({stagedQty} on {splitReqDay} + {shortfallQty} on {splitLaterDay})</span>
                    <ArrowRightIcon size={14} />
                  </button>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', padding: '0.65rem 0.85rem', background: 'var(--surface-subtle)', border: '1px dashed var(--rule)' }}>
                    No feasible split delivery schedule available from regional warehouses.
                  </div>
                )}

                {hasFeasibleLater ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isSubmitting || isChecking}
                    onClick={() => onDecision('accept_later')}
                    style={{ fontSize: '0.85rem', padding: '0.65rem 0.85rem', textAlign: 'left', justifyContent: 'space-between' }}
                  >
                    <span>Accept later single load (All {laterQty} on {laterDay}, {laterDateStr})</span>
                    <ArrowRightIcon size={14} />
                  </button>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', padding: '0.65rem 0.85rem', background: 'var(--surface-subtle)', border: '1px dashed var(--rule)' }}>
                    No feasible later consolidated delivery available.
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                padding: '0.85rem',
                background: 'var(--surface-subtle)',
                border: '1px dashed var(--rule)',
                fontSize: '0.85rem',
                color: 'var(--ink-secondary)'
              }}>
                No feasible alternative delivery schedule currently identified by the dispatch engine. Dispatch scanning remains in progress.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
