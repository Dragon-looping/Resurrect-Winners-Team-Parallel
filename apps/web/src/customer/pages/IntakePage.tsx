import React from 'react';

interface IntakePageProps {
  onNavigate: (route: string) => void;
}

export const IntakePage: React.FC<IntakePageProps> = ({ onNavigate }) => {
  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Manifest Intake · Customer Portal
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.1, textTransform: 'uppercase' }}>
          Request a delivery
        </h1>
        <p style={{ marginTop: '0.75rem', color: 'var(--ink-secondary)', fontSize: '1.05rem' }}>
          Submit logistics requirements for industrial fans and equipment. The dispatch system verifies real-time stock across regional fulfilment centers.
        </p>
      </div>

      <div className="ruled-box" style={{ padding: '1.75rem' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--ink-muted)' }}>
          Establishing customer intake form...
        </p>
        <div style={{ marginTop: '1.5rem' }}>
          <button 
            className="btn-primary" 
            onClick={() => onNavigate('/customer/orders/ORD-2026-MANIPAL-50')}
          >
            Go to Sample Order (ORD-2026-MANIPAL-50)
          </button>
        </div>
      </div>
    </div>
  );
};
