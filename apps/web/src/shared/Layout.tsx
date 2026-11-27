import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  orderRef?: string;
  statusBadge?: React.ReactNode;
  activeRoute?: string;
  onNavigate?: (route: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  orderRef,
  statusBadge,
  activeRoute = '/customer/request',
  onNavigate
}) => {
  return (
    <div className="dispatch-shell">
      <header className="dispatch-header">
        <div className="dispatch-header-inner">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
            <span 
              className="brand-title" 
              onClick={() => onNavigate && onNavigate('/customer/request')}
              style={{ cursor: onNavigate ? 'pointer' : 'default' }}
            >
              SETUVYUHA
            </span>
            <span className="brand-tag">DISPATCH & FULFILMENT</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {orderRef && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--ink-muted)' }}>ORDER:</span>
                <span className="tabular" style={{ fontWeight: 600, color: 'var(--ink)' }}>{orderRef}</span>
              </div>
            )}
            {statusBadge}
          </div>
        </div>
      </header>

      {/* Sub-nav for demonstration / switching */}
      <nav style={{ borderBottom: '1px solid var(--rule)', background: 'var(--canvas)', padding: '0.4rem 1.5rem', fontSize: '0.8rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => onNavigate && onNavigate('/customer/request')}
              style={{
                textDecoration: 'none',
                fontWeight: activeRoute.startsWith('/customer/request') ? 600 : 400,
                color: activeRoute.startsWith('/customer/request') ? 'var(--oxide-red)' : 'var(--ink-secondary)',
                borderBottom: activeRoute.startsWith('/customer/request') ? '2px solid var(--oxide-red)' : '2px solid transparent',
                paddingBottom: '2px'
              }}
            >
              Request Intake
            </button>
            <button
              onClick={() => onNavigate && onNavigate(orderRef ? `/customer/orders/${orderRef}` : '/customer/orders/ORD-2026-MANIPAL-50')}
              style={{
                textDecoration: 'none',
                fontWeight: activeRoute.startsWith('/customer/orders') ? 600 : 400,
                color: activeRoute.startsWith('/customer/orders') ? 'var(--oxide-red)' : 'var(--ink-secondary)',
                borderBottom: activeRoute.startsWith('/customer/orders') ? '2px solid var(--oxide-red)' : '2px solid transparent',
                paddingBottom: '2px'
              }}
            >
              {orderRef && activeRoute.startsWith('/customer/orders') ? `Order Portal (${orderRef})` : 'Order Portal (Sample)'}
            </button>
            <button
              onClick={() => onNavigate && onNavigate(orderRef ? `/planner/orders/${orderRef}` : '/planner')}
              style={{
                textDecoration: 'none',
                fontWeight: activeRoute.startsWith('/planner') ? 600 : 400,
                color: activeRoute.startsWith('/planner') ? 'var(--oxide-red)' : 'var(--ink-secondary)',
                borderBottom: activeRoute.startsWith('/planner') ? '2px solid var(--oxide-red)' : '2px solid transparent',
                paddingBottom: '2px'
              }}
            >
              Planner Workspace
            </button>
            <button
              onClick={() => onNavigate && onNavigate('/cases/steering')}
              style={{
                textDecoration: 'none',
                fontWeight: activeRoute.startsWith('/cases/steering') ? 600 : 400,
                color: activeRoute.startsWith('/cases/steering') ? 'var(--oxide-red)' : 'var(--ink-secondary)',
                borderBottom: activeRoute.startsWith('/cases/steering') ? '2px solid var(--oxide-red)' : '2px solid transparent',
                paddingBottom: '2px'
              }}
            >
              Case Steering & Clarify
            </button>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', fontSize: '0.75rem' }}>
            {activeRoute.startsWith('/planner') ? 'BRANCH 2: PLANNER WORKSPACE' : 'BRANCH 1: CUSTOMER PORTAL'}
          </div>
        </div>
      </nav>

      <main className="dispatch-main">
        {children}
      </main>

      <footer className="dispatch-footer">
        <div className="dispatch-footer-inner">
          <div>
            <span>SETUVYUHA Dispatch Engine · Regional Fulfilment Network</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)' }}>
            <span>AUTHORITATIVE LOGISTICS MANIFEST · 2026-11-27</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
