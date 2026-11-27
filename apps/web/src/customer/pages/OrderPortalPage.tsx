import React, { useState, useEffect, useCallback } from 'react';
import { CustomerOrder } from '../types/order.ts';
import { getOrderAdapter } from '../adapters/orderAdapter.ts';
import { ClarificationCard } from '../components/ClarificationCard.tsx';
import { AlertIcon, ClockIcon } from '../../shared/icons.tsx';

interface OrderPortalPageProps {
  orderId: string;
  onNavigate: (route: string) => void;
}

export const OrderPortalPage: React.FC<OrderPortalPageProps> = ({ orderId, onNavigate }) => {
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchOrder = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const adapter = getOrderAdapter();
      const data = await adapter.getOrder(orderId);
      setOrder(data);
    } catch (err: any) {
      setError(err.message || `Failed to fetch order ${orderId}`);
    } finally {
      setIsLoading(false);
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

  if (isLoading) {
    return (
      <div className="ruled-box" style={{ padding: '3rem', textAlign: 'center', background: 'var(--surface)' }}>
        <ClockIcon size={28} color="var(--ink-muted)" />
        <p style={{ marginTop: '1rem', color: 'var(--ink-secondary)', fontFamily: 'var(--font-mono)' }}>
          Retrieving logistics manifest for {orderId}...
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="ruled-box" style={{ padding: '2rem', background: 'var(--surface)', borderLeft: '4px solid var(--oxide-red)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <AlertIcon size={24} color="var(--oxide-red)" />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', textTransform: 'uppercase' }}>
            Manifest Access Error
          </h2>
        </div>
        <p style={{ color: 'var(--ink-secondary)', marginBottom: '1.5rem' }}>
          {error || `Order ${orderId} could not be located in current dispatch state.`}
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-primary" onClick={fetchOrder}>
            Retry Fetch
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('/customer/request')}>
            Return to Intake
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dispatch-grid">
      <div>
        {/* If in clarifying state, display inline clarification card */}
        {order.status === 'clarifying' && order.clarificationPrompt ? (
          <ClarificationCard
            order={order}
            prompt={order.clarificationPrompt}
            onSubmit={handleClarificationSubmit}
            isSubmitting={isSubmitting}
          />
        ) : (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
                  Order {order.orderId} · Version {order.version}
                </span>
              </div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.1, textTransform: 'uppercase' }}>
                Delivery Manifest Review
              </h1>
            </div>

            <div className="ruled-box" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--ink-muted)' }}>
                Order status: <strong>{order.status}</strong>
              </p>
            </div>
          </div>
        )}
      </div>

      <aside>
        <div className="ruled-box" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', textTransform: 'uppercase', marginBottom: '0.75rem', borderBottom: '1px solid var(--rule)', paddingBottom: '0.5rem' }}>
            Original Request
          </h3>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', fontSize: '0.875rem' }}>
            <dt style={{ color: 'var(--ink-muted)' }}>Item</dt>
            <dd style={{ fontWeight: 500 }}>{order.requestedDetails.itemName}</dd>
            <dt style={{ color: 'var(--ink-muted)' }}>Quantity</dt>
            <dd className="tabular" style={{ fontWeight: 600 }}>{order.requestedDetails.quantity} units</dd>
            <dt style={{ color: 'var(--ink-muted)' }}>Destination</dt>
            <dd>{order.requestedDetails.destination}</dd>
            <dt style={{ color: 'var(--ink-muted)' }}>Requested</dt>
            <dd className="tabular">{order.requestedDetails.requestedArrivalDate}</dd>
            <dt style={{ color: 'var(--ink-muted)' }}>Single Load</dt>
            <dd>{order.requestedDetails.mustArriveTogether ? 'Required' : 'Flexible'}</dd>
          </dl>
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--rule)' }}>
            <button className="btn-secondary" style={{ width: '100%' }} onClick={() => onNavigate('/customer/request')}>
              New Delivery Request
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
