import React from 'react';

interface OrderPortalPageProps {
  orderId: string;
  onNavigate: (route: string) => void;
}

export const OrderPortalPage: React.FC<OrderPortalPageProps> = ({ orderId, onNavigate }) => {
  return (
    <div className="dispatch-grid">
      <div>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
              Order {orderId}
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.1, textTransform: 'uppercase' }}>
            Choose a delivery schedule
          </h1>
          <p style={{ marginTop: '0.5rem', color: 'var(--ink-secondary)' }}>
            Physical warehouse count updated. Review available shipment schedules below.
          </p>
        </div>

        <div className="ruled-box" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--ink-muted)' }}>
            Establishing signature split offer screen...
          </p>
        </div>
      </div>

      <aside>
        <div className="ruled-box" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', textTransform: 'uppercase', marginBottom: '0.75rem', borderBottom: '1px solid var(--rule)', paddingBottom: '0.5rem' }}>
            Original Request
          </h3>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', fontSize: '0.875rem' }}>
            <dt style={{ color: 'var(--ink-muted)' }}>Item</dt>
            <dd style={{ fontWeight: 500 }}>High-Velocity Industrial Fans</dd>
            <dt style={{ color: 'var(--ink-muted)' }}>Quantity</dt>
            <dd className="tabular" style={{ fontWeight: 600 }}>50 units</dd>
            <dt style={{ color: 'var(--ink-muted)' }}>Destination</dt>
            <dd>Manipal Retail Outlet</dd>
            <dt style={{ color: 'var(--ink-muted)' }}>Requested</dt>
            <dd className="tabular">Friday, Nov 27, 2026</dd>
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
