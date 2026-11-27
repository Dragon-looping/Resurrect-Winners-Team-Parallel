import React from 'react';
import { CustomerOrder, OrderStatus } from '../types/order.ts';
import { CheckIcon, AlertIcon, ClockIcon, PackageIcon } from '../../shared/icons.tsx';

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'confirmed':
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.25rem 0.65rem',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          background: 'var(--forest-green-subtle)',
          color: 'var(--forest-green)',
          border: '1px solid var(--forest-green)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          <CheckIcon size={14} color="var(--forest-green)" />
          <span>SCHEDULE CONFIRMED</span>
        </span>
      );

    case 'offer_issued':
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.25rem 0.65rem',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          background: 'var(--amber-subtle)',
          color: 'var(--amber-warning)',
          border: '1px solid var(--amber-warning)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          <ClockIcon size={14} color="var(--amber-warning)" />
          <span>SCHEDULE PROPOSED</span>
        </span>
      );

    case 'recovery_pending':
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.25rem 0.65rem',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          background: 'var(--amber-subtle)',
          color: 'var(--amber-warning)',
          border: '1px solid var(--amber-warning)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          <ClockIcon size={14} color="var(--amber-warning)" />
          <span>RECOVERY PENDING</span>
        </span>
      );

    case 'unavoidable_delay':
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.25rem 0.65rem',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          background: 'var(--oxide-red-subtle)',
          color: 'var(--oxide-red)',
          border: '1px solid var(--oxide-red)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          <AlertIcon size={14} color="var(--oxide-red)" />
          <span>BALANCE DELAYED</span>
        </span>
      );

    case 'expired':
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.25rem 0.65rem',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          background: 'var(--surface-subtle)',
          color: 'var(--ink-muted)',
          border: '1px solid var(--rule-dark)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          <AlertIcon size={14} color="var(--ink-muted)" />
          <span>OFFER EXPIRED</span>
        </span>
      );

    case 'clarifying':
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.25rem 0.65rem',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          background: 'var(--amber-subtle)',
          color: 'var(--amber-warning)',
          border: '1px solid var(--amber-warning)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          <AlertIcon size={14} color="var(--amber-warning)" />
          <span>CLARIFYING</span>
        </span>
      );

    default:
      return (
        <span style={{
          padding: '0.25rem 0.65rem',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          background: 'var(--surface-subtle)',
          color: 'var(--ink-muted)',
          border: '1px solid var(--rule)'
        }}>
          {status.toUpperCase()}
        </span>
      );
  }
};

interface OrderSummarySideCardProps {
  order: CustomerOrder;
  onNavigate: (route: string) => void;
}

export const OrderSummarySideCard: React.FC<OrderSummarySideCardProps> = ({ order, onNavigate }) => {
  // Compute quantity breakdown
  const requestedTotal = order.requestedDetails.quantity;
  const confirmedTotal = (order.confirmedShipments || []).reduce((sum, s) => sum + s.quantity, 0);
  const offeredTotal = (order.activeOffer?.proposedShipments || []).reduce((sum, s) => sum + s.quantity, 0);
  const outstanding = requestedTotal - confirmedTotal;

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Original Request Box */}
      <div className="ruled-box" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--rule)', paddingBottom: '0.5rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Original Promise
          </h3>
          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>
            REV-{order.version}
          </span>
        </div>

        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', fontSize: '0.875rem' }}>
          <dt style={{ color: 'var(--ink-muted)' }}>Equipment</dt>
          <dd style={{ fontWeight: 600 }}>{order.requestedDetails.itemSku}</dd>

          <dt style={{ color: 'var(--ink-muted)' }}>Description</dt>
          <dd style={{ color: 'var(--ink-secondary)', fontSize: '0.85rem' }}>{order.requestedDetails.itemName}</dd>

          <dt style={{ color: 'var(--ink-muted)' }}>Requested Qty</dt>
          <dd className="tabular" style={{ fontWeight: 600 }}>{requestedTotal} units</dd>

          <dt style={{ color: 'var(--ink-muted)' }}>Destination</dt>
          <dd style={{ fontSize: '0.85rem' }}>{order.requestedDetails.destination}</dd>

          <dt style={{ color: 'var(--ink-muted)' }}>Target Date</dt>
          <dd className="tabular" style={{ fontWeight: 600 }}>{order.requestedDetails.requestedArrivalDate}</dd>

          <dt style={{ color: 'var(--ink-muted)' }}>Consignment</dt>
          <dd>{order.requestedDetails.mustArriveTogether ? 'Strict Single Load' : 'Flexible Multi-Load'}</dd>
        </dl>

        {order.requestedDetails.notes && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--rule)', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
            <em>"{order.requestedDetails.notes}"</em>
          </div>
        )}
      </div>

      {/* Tally Balance Summary */}
      <div className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <PackageIcon size={16} color="var(--ink)" />
          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', textTransform: 'uppercase' }}>
            Fulfilment Ledger
          </h4>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--rule-dark)', paddingBottom: '0.25rem' }}>
            <span style={{ color: 'var(--ink-muted)' }}>1. Total Requested:</span>
            <span className="tabular" style={{ fontWeight: 600 }}>{requestedTotal} fans</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--rule-dark)', paddingBottom: '0.25rem' }}>
            <span style={{ color: 'var(--ink-muted)' }}>2. Currently Offered:</span>
            <span className="tabular" style={{ fontWeight: 600, color: offeredTotal > 0 ? 'var(--amber-warning)' : 'var(--ink-muted)' }}>
              {offeredTotal} fans
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--rule-dark)', paddingBottom: '0.25rem' }}>
            <span style={{ color: 'var(--ink-muted)' }}>3. Confirmed &amp; Staged:</span>
            <span className="tabular" style={{ fontWeight: 700, color: confirmedTotal > 0 ? 'var(--forest-green)' : 'var(--ink-muted)' }}>
              {confirmedTotal} fans
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.25rem' }}>
            <span style={{ color: 'var(--ink-muted)' }}>4. Outstanding Balance:</span>
            <span className="tabular" style={{ fontWeight: 700, color: outstanding > 0 ? 'var(--oxide-red)' : 'var(--forest-green)' }}>
              {outstanding} fans
            </span>
          </div>
        </div>
      </div>

      {/* Nav Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button 
          className="btn-secondary" 
          style={{ width: '100%', fontSize: '0.85rem' }} 
          onClick={() => onNavigate('/customer/request')}
        >
          Create New Request
        </button>
      </div>
    </aside>
  );
};
