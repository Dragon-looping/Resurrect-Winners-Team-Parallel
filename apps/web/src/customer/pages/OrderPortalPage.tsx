import React, { useState, useEffect, useCallback } from 'react';
import { CustomerOrder, CustomerDecision } from '../types/order.ts';
import { getOrderAdapter } from '../adapters/orderAdapter.ts';
import { ClarificationCard } from '../components/ClarificationCard.tsx';
import { SplitOfferCard } from '../components/SplitOfferCard.tsx';
import { LaterOfferCard } from '../components/LaterOfferCard.tsx';
import { RecoveryPendingCard } from '../components/RecoveryPendingCard.tsx';
import { ConfirmedScheduleCard } from '../components/ConfirmedScheduleCard.tsx';
import { ExpiredOfferCard } from '../components/ExpiredOfferCard.tsx';
import { OrderStatusBadge, OrderSummarySideCard } from '../components/OrderStatusHeader.tsx';
import { AlertIcon, ClockIcon, RefreshIcon } from '../../shared/icons.tsx';
import { getUnitLabel, formatDayOfWeek } from '../utils/formatters.ts';

interface OrderPortalPageProps {
  orderId: string;
  onNavigate: (route: string) => void;
}

export const OrderPortalPage: React.FC<OrderPortalPageProps> = ({ orderId, onNavigate }) => {
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const fetchOrder = useCallback(async (showRefreshingState = false) => {
    if (showRefreshingState) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const adapter = getOrderAdapter();
      const data = await adapter.getOrder(orderId);
      setOrder(data);
      return data;
    } catch (err: any) {
      const msg = err.message || `Failed to fetch order ${orderId}`;
      setError(msg);
      if (showRefreshingState) {
        throw new Error(msg);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleClarificationSubmit = async (selectedOptionId: string) => {
    if (!order || !order.clarificationPrompt) return;
    setIsSubmitting(true);
    try {
      const adapter = getOrderAdapter();
      const updated = await adapter.submitClarification(
        order.orderId,
        order.clarificationPrompt.questionId,
        selectedOptionId
      );
      setOrder(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to submit clarification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOfferDecision = async (decision: CustomerDecision) => {
    if (!order || isSubmitting) return; // Guard double clicks
    if (!order.activeOffer && order.status !== 'recovery_pending') return;
    setIsSubmitting(true);
    setError(null);
    try {
      const adapter = getOrderAdapter();
      const updated = await adapter.replyToOffer(order.orderId, {
        offerId: order.activeOffer?.offerId || `OFF-${order.orderId}`,
        offerVersion: order.activeOffer?.version || order.version,
        decision
      });
      setOrder(updated);
    } catch (err: any) {
      // After an ambiguous failure or timeout, fetch authoritative state first before prompting retry
      try {
        const adapter = getOrderAdapter();
        const authoritative = await adapter.getOrder(order.orderId);
        if (authoritative.version > order.version) {
          // Reply was actually accepted by backend before network interruption!
          setOrder(authoritative);
          return;
        }
      } catch {
        // Authoritative fetch also failed
      }
      setError(err.message || 'Transmission failed. Checked authoritative state: reply was not recorded. You may safely retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefreshOffer = async () => {
    if (!order || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const adapter = getOrderAdapter();
      const updated = await adapter.refreshOffer(order.orderId);
      setOrder(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to renew allocation schedule.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard?.writeText(url).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }).catch(() => {});
  };

  if (isLoading) {
    return (
      <div className="ruled-box" style={{ padding: '3.5rem 1.5rem', textAlign: 'center', background: 'var(--surface)' }}>
        <ClockIcon size={32} color="var(--ink-muted)" />
        <p style={{ marginTop: '1rem', color: 'var(--ink-secondary)', fontFamily: 'var(--font-mono)' }}>
          Retrieving logistics manifest for {orderId}...
        </p>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="ruled-box" style={{ padding: '2rem', background: 'var(--surface)', borderLeft: '4px solid var(--oxide-red)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <AlertIcon size={24} color="var(--oxide-red)" />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', textTransform: 'uppercase' }}>
            Manifest Access Error
          </h2>
        </div>
        <p style={{ color: 'var(--ink-secondary)', marginBottom: '1.5rem' }}>
          {error}
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-primary" onClick={() => fetchOrder()}>
            Retry Fetch
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('/customer/request')}>
            Return to Intake
          </button>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const unitLabel = getUnitLabel(order.requestedDetails.itemSku, order.requestedDetails.itemName, false);
  const reqDay = formatDayOfWeek(order.requestedDetails.requestedArrivalDate);

  // Determine state-based heading & subtext
  let pageHeading = 'Review delivery manifest';
  let pageSubtext = 'Authoritative logistics record from the regional dispatch hub.';

  if (order.status === 'clarifying') {
    pageHeading = 'Resolve delivery ambiguity';
    pageSubtext = 'Please clarify timing specifications to enable automated allocation.';
  } else if (order.status === 'offer_issued') {
    pageHeading = 'Choose a delivery schedule';
    pageSubtext = 'Warehouse reconciliation updated. Review proposed shipment options below.';
  } else if (order.status === 'recovery_pending') {
    pageHeading = `Checking recovery for ${order.requestedDetails.quantity} ${unitLabel} by ${reqDay}`;
    pageSubtext = 'Original terms recorded. Scanning inter-depot transfers and buffer stock.';
  } else if (order.status === 'confirmed') {
    pageHeading = 'Authoritative schedule confirmed';
    pageSubtext = 'Shipment allocations locked with carrier dispatches staged.';
  } else if (order.status === 'unavoidable_delay') {
    pageHeading = 'Partial delivery scheduled · Balance delayed';
    pageSubtext = 'Available stock staged for transport; remaining units scheduled on earliest buffer arrival.';
  } else if (order.status === 'expired') {
    pageHeading = 'Offer proposal expired';
    pageSubtext = 'The 30-minute allocation reservation expired. Refresh to obtain current stock schedules.';
  }

  return (
    <div className="dispatch-grid">
      <div>
        {/* Top order meta banner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)' }}>
              MANIFEST #{order.orderId}
            </span>
            <OrderStatusBadge status={order.status} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={handleCopyLink}
              style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.25rem 0.5rem',
                border: '1px solid var(--rule)',
                background: 'var(--surface)',
                color: copyFeedback ? 'var(--forest-green)' : 'var(--ink-secondary)'
              }}
              title="Copy direct link to this order"
            >
              {copyFeedback ? 'LINK COPIED' : 'COPY DIRECT LINK'}
            </button>

            <button
              onClick={() => fetchOrder(true)}
              disabled={isRefreshing}
              style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.25rem 0.5rem',
                border: '1px solid var(--rule)',
                background: 'var(--surface)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: 'var(--ink-secondary)'
              }}
              title="Refresh order state from authoritative backend"
            >
              <RefreshIcon size={12} />
              <span>{isRefreshing ? 'REFRESHING...' : 'REFRESH'}</span>
            </button>
          </div>
        </div>

        {/* Global Action Error Banner if reply fails */}
        {error && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', color: 'var(--oxide-red)', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <AlertIcon size={16} color="var(--oxide-red)" />
            <span>{error}</span>
          </div>
        )}

        {/* Dynamic State Headline */}
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.5rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            lineHeight: 1.1,
            textTransform: 'uppercase',
            color: 'var(--ink)'
          }}>
            {pageHeading}
          </h1>
          <p style={{ marginTop: '0.5rem', color: 'var(--ink-secondary)', fontSize: '1.05rem' }}>
            {pageSubtext}
          </p>
        </div>

        {/* Content Area Based on Status */}
        {order.status === 'clarifying' && order.clarificationPrompt ? (
          <ClarificationCard
            order={order}
            prompt={order.clarificationPrompt}
            onSubmit={handleClarificationSubmit}
            isSubmitting={isSubmitting}
          />
        ) : order.status === 'recovery_pending' ? (
          <RecoveryPendingCard
            order={order}
            onDecision={handleOfferDecision}
            onRefresh={async () => { await fetchOrder(true); }}
            isSubmitting={isSubmitting}
          />
        ) : order.status === 'offer_issued' && order.activeOffer && order.activeOffer.offerType === 'later' ? (
          <LaterOfferCard
            order={order}
            offer={order.activeOffer}
            onDecision={handleOfferDecision}
            isSubmitting={isSubmitting}
          />
        ) : order.status === 'offer_issued' && order.activeOffer && (order.activeOffer.offerType === 'split' || order.activeOffer.offerType === 'standard') ? (
          <SplitOfferCard
            order={order}
            offer={order.activeOffer}
            onDecision={handleOfferDecision}
            isSubmitting={isSubmitting}
          />
        ) : order.status === 'expired' ? (
          <ExpiredOfferCard
            order={order}
            offer={order.activeOffer}
            onRefresh={handleRefreshOffer}
            isSubmitting={isSubmitting}
          />
        ) : order.status === 'confirmed' || order.status === 'unavoidable_delay' ? (
          <ConfirmedScheduleCard
            order={order}
            onNavigate={onNavigate}
          />
        ) : (
          <div className="ruled-box" style={{ padding: '1.5rem', background: 'var(--surface)' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--ink-muted)' }}>
              Active state: <strong>{order.status}</strong>
            </p>
          </div>
        )}
      </div>

      {/* Right Column: Original Promise and Tally Summary */}
      <OrderSummarySideCard order={order} onNavigate={onNavigate} />
    </div>
  );
};
