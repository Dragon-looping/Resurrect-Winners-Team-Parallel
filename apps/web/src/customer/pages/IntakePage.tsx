import React, { useState } from 'react';
import { getOrderAdapter, getAdapterConfig, setAdapterConfig, resetFixtureData } from '../adapters/orderAdapter.ts';
import { DeliveryRequest } from '../types/order.ts';
import { AlertIcon, ArrowRightIcon, CheckIcon, RotateCcwIcon } from '../../shared/icons.tsx';

interface IntakePageProps {
  onNavigate: (route: string) => void;
}

interface FormErrors {
  itemSku?: string;
  quantity?: string;
  destination?: string;
  requestedArrivalDate?: string;
  general?: string;
}

export const IntakePage: React.FC<IntakePageProps> = ({ onNavigate }) => {
  const [formData, setFormData] = useState<DeliveryRequest>({
    itemSku: 'FAN-HV-24-IND',
    itemName: 'High-Velocity 24" Industrial Pedestal Fans',
    quantity: 50,
    destination: 'Manipal Commercial Center, Shop #14',
    requestedArrivalDate: '2026-11-27', // Friday
    mustArriveTogether: false,
    notes: 'Required for university exhibition opening'
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successLink, setSuccessLink] = useState<string | null>(null);
  const [adapterConfig, setConfig] = useState(getAdapterConfig());

  const handleInputChange = (field: keyof DeliveryRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!formData.itemSku.trim()) {
      errs.itemSku = 'Equipment SKU / model identifier is required.';
    }
    if (!formData.quantity || formData.quantity <= 0 || !Number.isInteger(Number(formData.quantity))) {
      errs.quantity = 'Quantity must be a positive whole number.';
    }
    if (!formData.destination.trim()) {
      errs.destination = 'Delivery destination address is required.';
    }
    if (!formData.requestedArrivalDate) {
      errs.requestedArrivalDate = 'Requested arrival date is required.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});
    try {
      const adapter = getOrderAdapter();
      const order = await adapter.createOrder(formData);
      setSuccessLink(`/customer/orders/${order.orderId}`);
      onNavigate(`/customer/orders/${order.orderId}`);
    } catch (err: any) {
      setErrors({
        general: err.message || 'Failed to submit delivery request. Verify backend connection.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAdapterMode = (mode: 'fixture' | 'live') => {
    setAdapterConfig({ mode });
    setConfig(getAdapterConfig());
  };

  const handleReset = () => {
    resetFixtureData();
    setFormData({
      itemSku: 'FAN-HV-24-IND',
      itemName: 'High-Velocity 24" Industrial Pedestal Fans',
      quantity: 50,
      destination: 'Manipal Commercial Center, Shop #14',
      requestedArrivalDate: '2026-11-27',
      mustArriveTogether: false,
      notes: 'Required for university exhibition opening'
    });
    setErrors({});
    setSuccessLink(null);
  };

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem', borderBottom: '1px solid var(--rule)', paddingBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              Document Ref: REQ-INTAKE-FORM · Udupi Logistics Hub
            </p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.1, textTransform: 'uppercase' }}>
              Request a delivery
            </h1>
          </div>
          
          <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--rule)', background: 'var(--surface)', padding: '0.25rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            <span style={{ padding: '0.2rem 0.5rem', color: 'var(--ink-muted)' }}>MODE:</span>
            <button
              type="button"
              onClick={() => toggleAdapterMode('fixture')}
              style={{
                padding: '0.25rem 0.6rem',
                background: adapterConfig.mode === 'fixture' ? 'var(--ink)' : 'transparent',
                color: adapterConfig.mode === 'fixture' ? 'var(--surface)' : 'var(--ink)',
                fontWeight: adapterConfig.mode === 'fixture' ? 600 : 400
              }}
            >
              FIXTURE
            </button>
            <button
              type="button"
              onClick={() => toggleAdapterMode('live')}
              style={{
                padding: '0.25rem 0.6rem',
                background: adapterConfig.mode === 'live' ? 'var(--oxide-red)' : 'transparent',
                color: adapterConfig.mode === 'live' ? 'var(--surface)' : 'var(--ink)',
                fontWeight: adapterConfig.mode === 'live' ? 600 : 400
              }}
            >
              LIVE API
            </button>
          </div>
        </div>
        
        <p style={{ marginTop: '0.75rem', color: 'var(--ink-secondary)', fontSize: '1rem', maxWidth: '640px' }}>
          Specify equipment and required destination. The dispatch engine evaluates stock positions across Udupi Central and regional depots.
        </p>
      </div>

      {errors.general && (
        <div style={{ padding: '1rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', color: 'var(--oxide-red)', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <AlertIcon size={20} color="var(--oxide-red)" />
          <div>
            <strong>Submission Rejected:</strong> {errors.general}
          </div>
        </div>
      )}

      {successLink && (
        <div style={{ padding: '1rem', background: 'var(--forest-green-subtle)', border: '1px solid var(--forest-green)', color: 'var(--forest-green)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckIcon size={20} color="var(--forest-green)" />
            <span>Order registered in dispatch pipeline.</span>
          </div>
          <button 
            type="button" 
            className="btn-primary" 
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
            onClick={() => onNavigate(successLink)}
          >
            Open Order Manifest →
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="ruled-box" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div>
            <label htmlFor="itemSku" style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
              Equipment SKU / Description <span style={{ color: 'var(--oxide-red)' }}>*</span>
            </label>
            <input
              id="itemSku"
              type="text"
              value={formData.itemSku}
              onChange={(e) => handleInputChange('itemSku', e.target.value)}
              placeholder="e.g. FAN-HV-24-IND"
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.95rem',
                border: errors.itemSku ? '1px solid var(--oxide-red)' : '1px solid var(--rule-dark)',
                background: 'var(--surface)',
                color: 'var(--ink)'
              }}
            />
            <div style={{ marginTop: '0.35rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--ink-muted)' }}>{formData.itemName}</span>
              {errors.itemSku && (
                <span style={{ color: 'var(--oxide-red)', fontWeight: 500 }}>{errors.itemSku}</span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
            <div>
              <label htmlFor="quantity" style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                Quantity (Units) <span style={{ color: 'var(--oxide-red)' }}>*</span>
              </label>
              <input
                id="quantity"
                type="number"
                min="1"
                step="1"
                value={formData.quantity}
                onChange={(e) => handleInputChange('quantity', parseInt(e.target.value, 10) || 0)}
                className="tabular"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  border: errors.quantity ? '1px solid var(--oxide-red)' : '1px solid var(--rule-dark)',
                  background: 'var(--surface)',
                  color: 'var(--ink)'
                }}
              />
              <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Quick preset:</span>
                <button
                  type="button"
                  onClick={() => handleInputChange('quantity', 50)}
                  style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', border: '1px solid var(--rule)', background: formData.quantity === 50 ? 'var(--surface-subtle)' : 'transparent' }}
                >
                  50 fans (Manipal benchmark)
                </button>
                <button
                  type="button"
                  onClick={() => handleInputChange('quantity', 25)}
                  style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', border: '1px solid var(--rule)' }}
                >
                  25
                </button>
              </div>
              {errors.quantity && (
                <p style={{ marginTop: '0.25rem', color: 'var(--oxide-red)', fontSize: '0.8rem', fontWeight: 500 }}>
                  {errors.quantity}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="requestedArrivalDate" style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                Requested Arrival Date <span style={{ color: 'var(--oxide-red)' }}>*</span>
              </label>
              <input
                id="requestedArrivalDate"
                type="date"
                value={formData.requestedArrivalDate}
                onChange={(e) => handleInputChange('requestedArrivalDate', e.target.value)}
                className="tabular"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem',
                  fontSize: '0.95rem',
                  border: errors.requestedArrivalDate ? '1px solid var(--oxide-red)' : '1px solid var(--rule-dark)',
                  background: 'var(--surface)',
                  color: 'var(--ink)'
                }}
              />
              <p style={{ marginTop: '0.35rem', color: 'var(--ink-muted)', fontSize: '0.8rem' }}>
                Benchmark: Friday, Nov 27, 2026
              </p>
              {errors.requestedArrivalDate && (
                <p style={{ marginTop: '0.25rem', color: 'var(--oxide-red)', fontSize: '0.8rem', fontWeight: 500 }}>
                  {errors.requestedArrivalDate}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="destination" style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
              Destination Address / Outlet <span style={{ color: 'var(--oxide-red)' }}>*</span>
            </label>
            <input
              id="destination"
              type="text"
              value={formData.destination}
              onChange={(e) => handleInputChange('destination', e.target.value)}
              placeholder="e.g. Manipal Commercial Center, Shop #14"
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                fontSize: '0.95rem',
                border: errors.destination ? '1px solid var(--oxide-red)' : '1px solid var(--rule-dark)',
                background: 'var(--surface)',
                color: 'var(--ink)'
              }}
            />
            {errors.destination && (
              <p style={{ marginTop: '0.25rem', color: 'var(--oxide-red)', fontSize: '0.8rem', fontWeight: 500 }}>
                {errors.destination}
              </p>
            )}
          </div>

          <div style={{ background: 'var(--surface-subtle)', padding: '1rem', border: '1px solid var(--rule)' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.mustArriveTogether}
                onChange={(e) => handleInputChange('mustArriveTogether', e.target.checked)}
                style={{ marginTop: '0.2rem', accentColor: 'var(--oxide-red)', width: '18px', height: '18px' }}
              />
              <div>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                  Strict Single Delivery Requirement
                </span>
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)', marginTop: '0.2rem' }}>
                  If selected, all units must arrive together in one single consignment. If regional warehouse stock is insufficient, split alternatives will require explicit customer override.
                </p>
              </div>
            </label>
          </div>

          <div>
            <label htmlFor="notes" style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
              Customer Fulfilment Instructions / Phrasing (Optional)
            </label>
            <textarea
              id="notes"
              rows={2}
              value={formData.notes || ''}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="e.g. Required for university exhibition opening. Test ambiguous timing by including 'ambiguous'."
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                fontSize: '0.9rem',
                border: '1px solid var(--rule-dark)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--rule)', flexWrap: 'wrap', gap: '1rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleReset}
              style={{ fontSize: '0.85rem' }}
            >
              <RotateCcwIcon size={14} />
              Reset Defaults
            </button>

            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
              style={{ minWidth: '220px' }}
            >
              {isSubmitting ? (
                <span>Evaluating Warehouse Stock...</span>
              ) : (
                <>
                  <span>Submit Delivery Request</span>
                  <ArrowRightIcon size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      <div style={{ marginTop: '2.5rem', borderTop: '1px dashed var(--rule-dark)', paddingTop: '1.5rem' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
          Direct Test Fixtures &amp; Hackathon Scenarios:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate('/customer/orders/ORD-2026-MANIPAL-50')}
            style={{ textAlign: 'left', padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
          >
            <span style={{ fontWeight: 600 }}>1. Signature Split Offer</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>40 on Fri / 10 on Sun</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate('/customer/orders/ORD-2026-MANIPAL-CLARIFY')}
            style={{ textAlign: 'left', padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
          >
            <span style={{ fontWeight: 600 }}>2. Clarification Inline</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Arrival vs dispatch date</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate('/customer/orders/ORD-2026-MANIPAL-LATER')}
            style={{ textAlign: 'left', padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
          >
            <span style={{ fontWeight: 600 }}>3. Later Single Delivery</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>50 on Tue, Dec 01</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate('/customer/orders/ORD-2026-MANIPAL-CONFIRMED-SPLIT')}
            style={{ textAlign: 'left', padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
          >
            <span style={{ fontWeight: 600 }}>4. Confirmed Schedule</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>2 shipments booked</span>
          </button>
        </div>
      </div>
    </div>
  );
};
