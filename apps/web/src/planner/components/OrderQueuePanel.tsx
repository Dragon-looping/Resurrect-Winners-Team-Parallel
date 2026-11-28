import React, { useState } from 'react';
import { PlannerIntakeRequest, PlannerOrder } from '../types/planner.ts';
import { PRODUCT_CATALOG, findCatalogItem } from '../../customer/fixtures/catalog.ts';
import { ArrowRightIcon, AlertIcon } from '../../shared/icons.tsx';

interface OrderQueuePanelProps {
  orders: PlannerOrder[];
  activeOrderId: string;
  onSelectOrder: (orderId: string) => void;
  onCreateOrder: (req: PlannerIntakeRequest) => Promise<void>;
  isSubmitting?: boolean;
  error?: string | null;
}

const RISK_LABELS: Record<PlannerOrder['riskStatus'], { text: string; color: string; bg: string }> = {
  on_track: { text: 'ON TRACK', color: 'var(--forest-green)', bg: 'var(--forest-green-subtle)' },
  at_risk: { text: 'AT RISK', color: 'var(--amber-warning)', bg: 'var(--amber-subtle)' },
  critical_shortage: { text: 'CRITICAL', color: 'var(--oxide-red)', bg: 'var(--oxide-red-subtle)' },
  unavoidable_delay: { text: 'DELAYED', color: 'var(--oxide-red)', bg: 'var(--oxide-red-subtle)' },
  resolved: { text: 'RESOLVED', color: 'var(--forest-green)', bg: 'var(--forest-green-subtle)' }
};

export const OrderQueuePanel: React.FC<OrderQueuePanelProps> = ({
  orders,
  activeOrderId,
  onSelectOrder,
  onCreateOrder,
  isSubmitting = false,
  error = null
}) => {
  const [showIntake, setShowIntake] = useState(false);
  const [sku, setSku] = useState(PRODUCT_CATALOG[0].sku);
  const [quantity, setQuantity] = useState(PRODUCT_CATALOG[0].defaultQuantity);
  const [destination, setDestination] = useState(PRODUCT_CATALOG[0].defaultDestination);
  const [requestedArrival, setRequestedArrival] = useState('2026-11-27');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSkuChange = (nextSku: string) => {
    setSku(nextSku);
    const match = findCatalogItem(nextSku);
    if (match) {
      setQuantity(match.defaultQuantity);
      setDestination(match.defaultDestination);
    }
  };

  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || quantity <= 0 || !destination.trim() || !requestedArrival) {
      setFormError('SKU, positive quantity, destination, and arrival date are required.');
      return;
    }
    setFormError(null);
    await onCreateOrder({
      itemSku: sku.trim(),
      itemName: findCatalogItem(sku)?.name,
      quantity,
      destination: destination.trim(),
      requestedArrival
    });
    setShowIntake(false);
  };

  return (
    <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Outstanding-Order Queue ({orders.length})
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
            Select an order by ID to inspect route feasibility, cutoff impact, and recovery options.
          </p>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => setShowIntake(prev => !prev)}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
        >
          {showIntake ? 'Close Planner Intake' : '+ New Planner Order'}
        </button>
      </div>

      {showIntake && (
        <form onSubmit={handleIntakeSubmit} style={{ padding: '1rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule-dark)', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label htmlFor="planner-sku" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                SKU
              </label>
              <select
                id="planner-sku"
                value={sku}
                onChange={e => handleSkuChange(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--rule-dark)', background: 'var(--surface)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
              >
                {PRODUCT_CATALOG.map(item => (
                  <option key={item.sku} value={item.sku}>
                    {item.sku} — {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="planner-qty" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Quantity
              </label>
              <input
                id="planner-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={e => setQuantity(parseInt(e.target.value, 10) || 0)}
                className="tabular"
                style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--rule-dark)', background: 'var(--surface)' }}
              />
            </div>
            <div>
              <label htmlFor="planner-dest" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Destination
              </label>
              <input
                id="planner-dest"
                type="text"
                value={destination}
                onChange={e => setDestination(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--rule-dark)', background: 'var(--surface)' }}
              />
            </div>
            <div>
              <label htmlFor="planner-date" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Agreed Arrival Date
              </label>
              <input
                id="planner-date"
                type="date"
                value={requestedArrival}
                onChange={e => setRequestedArrival(e.target.value)}
                className="tabular"
                style={{ width: '100%', padding: '0.45rem', border: '1px solid var(--rule-dark)', background: 'var(--surface)' }}
              />
            </div>
          </div>
          {formError && <p style={{ color: 'var(--oxide-red)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{formError}</p>}
          <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            <span>{isSubmitting ? 'Creating...' : 'Create & Open Order'}</span>
            <ArrowRightIcon size={14} />
          </button>
        </form>
      )}

      {error && (
        <div style={{ padding: '0.85rem 1rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', color: 'var(--oxide-red)', marginBottom: '1rem', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertIcon size={16} color="var(--oxide-red)" />
          <span>Failed to load order queue: {error}</span>
        </div>
      )}

      {orders.length === 0 && (
        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--ink-muted)', background: 'var(--surface-subtle)', border: '1px dashed var(--rule)', marginBottom: '1rem' }}>
          {error ? `Queue unavailable (${error})` : 'No outstanding orders found in queue.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
        {orders.map(o => {
          const active = o.orderId === activeOrderId;
          const badge = RISK_LABELS[o.riskStatus];
          return (
            <button
              key={o.orderId}
              type="button"
              onClick={() => onSelectOrder(o.orderId)}
              style={{
                textAlign: 'left',
                padding: '0.85rem 1rem',
                border: active ? '2px solid var(--oxide-red)' : '1px solid var(--rule-dark)',
                background: active ? 'var(--oxide-red-subtle)' : 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink)' }}>
                  {o.orderId}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.35rem', color: badge.color, background: badge.bg, border: `1px solid ${badge.color}` }}>
                  {badge.text}
                </span>
              </div>
              <div className="tabular" style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--ink)' }}>
                {o.quantity} {o.unitLabel} · {o.itemSku}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                {o.destination}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
