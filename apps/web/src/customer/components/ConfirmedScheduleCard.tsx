import React from 'react';
import { CustomerOrder } from '../types/order.ts';
import { CheckIcon, AlertIcon, TruckIcon, PackageIcon } from '../../shared/icons.tsx';
import { getUnitLabel, formatDateString } from '../utils/formatters.ts';

interface ConfirmedScheduleCardProps {
  order: CustomerOrder;
  onNavigate: (route: string) => void;
}

export const ConfirmedScheduleCard: React.FC<ConfirmedScheduleCardProps> = ({
  order,
  onNavigate
}) => {
  const confirmed = order.confirmedShipments || [];
  const isDelay = order.status === 'unavoidable_delay';
  const totalConfirmed = confirmed.reduce((sum, s) => sum + s.quantity, 0);
  const sku = order.requestedDetails.itemSku;
  const itemName = order.requestedDetails.itemName;
  const unitLabel = getUnitLabel(sku, itemName, false);
  const unitLabelUpper = unitLabel.toUpperCase();
  const reqQty = order.requestedDetails.quantity;
  const reqDate = formatDateString(order.requestedDetails.requestedArrivalDate);

  return (
    <div className="ruled-box" style={{ background: 'var(--surface)', border: '1px solid var(--rule)' }}>
      {/* Banner */}
      <div style={{
        padding: '0.85rem 1.25rem',
        background: isDelay ? 'var(--oxide-red-subtle)' : 'var(--forest-green-subtle)',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isDelay ? (
            <AlertIcon size={16} color="var(--oxide-red)" />
          ) : (
            <CheckIcon size={16} color="var(--forest-green)" />
          )}
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: isDelay ? 'var(--oxide-red)' : 'var(--forest-green)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            {isDelay ? 'PARTIAL ALLOCATION CONFIRMED · BALANCE DELAYED' : 'AUTHORITATIVE DISPATCH SCHEDULE CONFIRMED'}
          </span>
        </div>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
          BOOKED {new Date(order.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div style={{ padding: '1.5rem 1.25rem' }}>
        <p style={{ color: 'var(--ink-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
          {confirmed.length > 1
            ? `Two confirmed consignments have been locked into the dispatch pipeline. Consignments will arrive across the dates scheduled below.`
            : 'A single consolidated consignment has been confirmed and locked into the dispatch pipeline.'}
        </p>

        {/* Confirmed Shipments List */}
        <div style={{ border: '2px solid var(--forest-green)', marginBottom: '1.75rem', background: 'var(--canvas)' }}>
          {confirmed.map((shp, index) => {
            const isFirst = index === 0;
            return (
              <div
                key={shp.shipmentId}
                className="split-offer-row"
                style={{
                  padding: '1.25rem 1.25rem',
                  borderBottom: confirmed.length > 1 && isFirst ? '2px solid var(--forest-green)' : 'none',
                  background: 'var(--surface)'
                }}
              >
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.15rem' }}>
                    Shipment {index + 1} of {confirmed.length}
                  </div>
                  <div className="tabular" style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '2rem',
                    fontWeight: 700,
                    lineHeight: 1,
                    color: 'var(--forest-green)'
                  }}>
                    {shp.quantity} {unitLabelUpper}
                  </div>
                </div>

                <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.35rem',
                      fontWeight: 700,
                      color: 'var(--ink)',
                      textTransform: 'uppercase'
                    }}>
                      {formatDateString(shp.arrivalDate)}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--forest-green-subtle)',
                      color: 'var(--forest-green)',
                      padding: '0.1rem 0.4rem',
                      border: '1px solid var(--forest-green)',
                      fontWeight: 600
                    }}>
                      CONFIRMED DATE
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', fontSize: '0.85rem', color: 'var(--ink-secondary)' }}>
                    <TruckIcon size={14} color="var(--forest-green)" />
                    <span>{shp.originWarehouse} → {shp.destination}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>
                    <span>CARRIER REF: <strong style={{ color: 'var(--ink)' }}>{shp.carrierTrackingRef || 'PENDING'}</strong></span>
                    <span>STATUS: <strong style={{ color: 'var(--forest-green)' }}>{shp.statusText}</strong></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Backlog Box for Unavoidable Delay */}
        {isDelay && (
          <div style={{
            padding: '1.25rem',
            background: 'var(--oxide-red-subtle)',
            border: '2px dashed var(--oxide-red)',
            marginBottom: '1.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <AlertIcon size={18} color="var(--oxide-red)" />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--oxide-red)', textTransform: 'uppercase' }}>
                Remaining Balance Backlog: {order.backlogQuantity || 0} {unitLabelUpper} Outstanding
              </span>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--ink)', marginBottom: '0.5rem' }}>
              <strong>Customer-Facing Delay Explanation:</strong> {order.customerDelayReason}
            </p>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-secondary)' }}>
              <span>ORIGINAL TARGET: <strong className="tabular">{reqDate}</strong></span>
              <span>EARLIEST PROJECTED ARRIVAL: <strong className="tabular" style={{ color: 'var(--oxide-red)' }}>
                {order.requestedDetails.requestedArrivalDate ? 'Pending Supplier ETA' : 'TBD'}
              </strong></span>
            </div>
          </div>
        )}

        {/* Summary check against original request */}
        <div style={{
          padding: '0.85rem 1rem',
          border: '1px solid var(--rule)',
          background: 'var(--surface)',
          marginBottom: '1.75rem',
          fontSize: '0.85rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ color: 'var(--ink-muted)' }}>
              Requested: <strong style={{ color: 'var(--ink)' }}>{reqQty} {unitLabel} by {reqDate}</strong>
            </span>
            <span style={{ color: 'var(--ink-muted)' }}>
              Total Confirmed: <strong style={{ color: 'var(--forest-green)' }}>{totalConfirmed} of {reqQty} {unitLabel}</strong>
            </span>
          </div>
        </div>

        {/* Action button */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => window.print()}
            style={{ fontSize: '0.85rem' }}
          >
            <PackageIcon size={16} />
            <span>Print Logistics Waybill</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => onNavigate('/customer/request')}
            style={{ fontSize: '0.85rem' }}
          >
            <span>Create Another Request</span>
          </button>
        </div>
      </div>
    </div>
  );
};
