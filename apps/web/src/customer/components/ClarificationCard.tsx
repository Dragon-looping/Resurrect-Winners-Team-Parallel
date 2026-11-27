import React, { useState } from 'react';
import { CustomerOrder, ClarificationPrompt } from '../types/order.ts';
import { HelpCircleIcon, ArrowRightIcon, AlertIcon } from '../../shared/icons.tsx';

interface ClarificationCardProps {
  order: CustomerOrder;
  prompt: ClarificationPrompt;
  onSubmit: (selectedOptionId: string) => Promise<void>;
  isSubmitting?: boolean;
}

export const ClarificationCard: React.FC<ClarificationCardProps> = ({
  order,
  prompt,
  onSubmit,
  isSubmitting = false
}) => {
  const [selectedOption, setSelectedOption] = useState<string>(
    prompt.options[0]?.id || ''
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOption) {
      setError('Please select an option to resolve fulfilment schedule.');
      return;
    }
    setError(null);
    try {
      await onSubmit(selectedOption);
    } catch (err: any) {
      setError(err.message || 'Unable to update schedule resolution.');
    }
  };

  return (
    <div className="ruled-box" style={{ padding: '1.75rem', borderLeft: '4px solid var(--amber-warning)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <HelpCircleIcon size={20} color="var(--amber-warning)" />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--amber-warning)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Logistics Ambiguity · Resolution Required
        </span>
      </div>

      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.2, marginBottom: '0.5rem' }}>
        {prompt.questionText}
      </h2>

      <p style={{ color: 'var(--ink-secondary)', fontSize: '0.95rem', marginBottom: '1.25rem' }}>
        The dispatch schedule differs depending on whether your requested deadline refers to delivery at the Manipal dock or release from the Udupi warehouse.
      </p>

      {/* Retained Answers Context Banner */}
      <div style={{ background: 'var(--surface-subtle)', padding: '0.75rem 1rem', border: '1px solid var(--rule)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
        <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '0.35rem' }}>
          Retained Request Parameters:
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', color: 'var(--ink-muted)' }}>
          <span>SKU: <strong style={{ color: 'var(--ink)' }}>{order.requestedDetails.itemSku}</strong></span>
          <span>Quantity: <strong className="tabular" style={{ color: 'var(--ink)' }}>{order.requestedDetails.quantity} units</strong></span>
          <span>Destination: <strong style={{ color: 'var(--ink)' }}>{order.requestedDetails.destination}</strong></span>
          <span>Strict Single Delivery: <strong style={{ color: 'var(--ink)' }}>{order.requestedDetails.mustArriveTogether ? 'Yes' : 'No'}</strong></span>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', color: 'var(--oxide-red)', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertIcon size={16} color="var(--oxide-red)" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {prompt.options.map((opt) => {
            const isChecked = selectedOption === opt.id;
            return (
              <label
                key={opt.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.85rem',
                  padding: '1rem',
                  border: isChecked ? '1px solid var(--oxide-red)' : '1px solid var(--rule)',
                  background: isChecked ? 'var(--oxide-red-subtle)' : 'var(--surface)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease'
                }}
              >
                <input
                  type="radio"
                  name="clarificationOption"
                  value={opt.id}
                  checked={isChecked}
                  onChange={() => setSelectedOption(opt.id)}
                  style={{ marginTop: '0.2rem', accentColor: 'var(--oxide-red)', width: '18px', height: '18px' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: isChecked ? 'var(--oxide-red)' : 'var(--ink)', fontSize: '0.95rem' }}>
                    {opt.label}
                  </div>
                  {opt.description && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginTop: '0.2rem' }}>
                      {opt.description}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting}
            style={{ minWidth: '220px' }}
          >
            {isSubmitting ? (
              <span>Updating Schedule...</span>
            ) : (
              <>
                <span>Confirm Schedule Interpretation</span>
                <ArrowRightIcon size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
