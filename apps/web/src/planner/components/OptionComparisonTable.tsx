import React from 'react';
import { OptionComparisonRow, PlannerOrder } from '../types/planner.ts';
import { CheckIcon, AlertIcon } from '../../shared/icons.tsx';

interface OptionComparisonTableProps {
  order: PlannerOrder;
  onSelectCandidate: (candidateId: string) => void;
}

const STRATEGY_LABELS: Record<OptionComparisonRow['strategy'], string> = {
  wait: 'Wait / Delay',
  spare_sourcing: 'Spare Sourcing',
  swap: 'Inter-Order Swap'
};

function inr(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

export const OptionComparisonTable: React.FC<OptionComparisonTableProps> = ({
  order,
  onSelectCandidate
}) => {
  const best = order.optionComparisons
    .filter(o => o.feasible)
    .sort((a, b) => b.remainingMarginInr - a.remainingMarginInr)[0];

  return (
    <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
          Option Comparison · Freight, Penalties &amp; Margin
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
          Figures from P2 logistics engine (fixture in current mode). Select a row to switch recovery candidate.
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface-subtle)', borderBottom: '2px solid var(--rule-dark)' }}>
              {['Strategy', 'Affected Orders', 'Freight', 'SLA Penalty', 'Revenue', 'Remaining Margin', 'Delta', 'Feasible'].map(h => (
                <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--ink-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.optionComparisons.map((row, idx) => {
              const isBest = best && row.strategy === best.strategy;
              const candidate = order.candidates.find(c => c.strategy === row.strategy);
              const isSelected = candidate?.candidateId === order.selectedCandidateId;

              return (
                <tr
                  key={idx}
                  onClick={() => candidate && onSelectCandidate(candidate.candidateId)}
                  style={{
                    borderBottom: '1px solid var(--rule)',
                    background: isSelected ? 'var(--oxide-red-subtle)' : isBest ? 'var(--forest-green-subtle)' : 'var(--surface)',
                    cursor: candidate ? 'pointer' : 'default',
                    outline: isSelected ? '2px solid var(--oxide-red)' : undefined
                  }}
                >
                  <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700 }}>
                    <div>{STRATEGY_LABELS[row.strategy]}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', fontWeight: 400 }}>{row.label}</div>
                  </td>
                  <td style={{ padding: '0.65rem 0.75rem' }}>
                    {row.affectedOrders.map(oid => (
                      <div key={oid} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-secondary)' }}>{oid}</div>
                    ))}
                  </td>
                  <td className="tabular" style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>{inr(row.freightCostInr)}</td>
                  <td className="tabular" style={{ padding: '0.65rem 0.75rem', color: row.slaPenaltyInr > 0 ? 'var(--oxide-red)' : 'var(--ink)', fontWeight: row.slaPenaltyInr > 0 ? 700 : 400 }}>
                    {row.slaPenaltyInr > 0 ? inr(row.slaPenaltyInr) : '—'}
                  </td>
                  <td className="tabular" style={{ padding: '0.65rem 0.75rem', color: 'var(--ink-secondary)' }}>{inr(row.orderRevenueInr)}</td>
                  <td className="tabular" style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: row.feasible ? 'var(--forest-green)' : 'var(--oxide-red)' }}>
                    {inr(row.remainingMarginInr)}
                  </td>
                  <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.78rem' }}>
                    <span style={{
                      color: isBest ? 'var(--forest-green)' : row.slaPenaltyInr > 0 ? 'var(--oxide-red)' : 'var(--ink-secondary)',
                      fontWeight: isBest ? 700 : 400
                    }}>
                      {row.marginDeltaLabel}
                    </span>
                  </td>
                  <td style={{ padding: '0.65rem 0.75rem' }}>
                    {row.feasible
                      ? <CheckIcon size={16} color="var(--forest-green)" />
                      : <AlertIcon size={16} color="var(--oxide-red)" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {best && (
            <tfoot>
              <tr style={{ background: 'var(--forest-green-subtle)', borderTop: '2px solid var(--forest-green)' }}>
                <td colSpan={8} style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--forest-green)', fontWeight: 700 }}>
                  <CheckIcon size={14} color="var(--forest-green)" />
                  &nbsp; RECOMMENDED: {STRATEGY_LABELS[best.strategy]} — {best.marginDeltaLabel} · {inr(best.remainingMarginInr)} remaining margin
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
};
