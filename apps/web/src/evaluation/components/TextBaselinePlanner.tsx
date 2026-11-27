import React, { useState } from 'react';
import { EvaluationCase } from '../types/evaluation.ts';
import { CheckIcon, AlertIcon } from '../../shared/icons.tsx';

interface TextBaselinePlannerProps {
  evaluationCase: EvaluationCase;
  onSelectCandidate: (candidateId: string, testedCutoff: string) => void;
  disabled?: boolean;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function inr(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}

export const TextBaselinePlanner: React.FC<TextBaselinePlannerProps> = ({
  evaluationCase,
  onSelectCandidate,
  disabled = false
}) => {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(
    evaluationCase.candidates[0].candidateId
  );
  const [testedCutoff, setTestedCutoff] = useState<string>(
    evaluationCase.primaryCustomer.originalCutoff.includes(':')
      ? evaluationCase.primaryCustomer.originalCutoff.slice(-5)
      : '16:00'
  );
  const [hasSimulated, setHasSimulated] = useState<boolean>(false);

  const selectedCandidate = evaluationCase.candidates.find(
    c => c.candidateId === selectedCandidateId
  ) || evaluationCase.candidates[0];

  const testedMins = parseMinutes(testedCutoff);
  const reqMins = parseMinutes(selectedCandidate.requiredCutoff);
  const isCutoffSafe = testedMins >= reqMins;

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSimulated(true);
  };

  const handleSubmit = () => {
    onSelectCandidate(selectedCandidateId, testedCutoff);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Baseline banner */}
      <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-subtle)', borderLeft: '4px solid var(--ink-secondary)', borderTop: '1px solid var(--rule)', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-muted)', marginBottom: '0.2rem' }}>
          INTERFACE 1 OF 2 · TEXT-ONLY BASELINE DISPATCH LOG
        </p>
        <p style={{ fontSize: '0.86rem', color: 'var(--ink)' }}>
          This baseline presents dispatch facts, constraints, and candidate options in tabular textual format without spatial Godown mapping or route animations.
        </p>
      </div>

      {/* Narrative & Case Facts Table */}
      <section className="ruled-box" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
          Incident Log &amp; Inventory Discrepancy
        </h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--ink-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
          {evaluationCase.narrative}
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-subtle)', borderBottom: '2px solid var(--rule-dark)' }}>
                {['Customer & Order ID', 'SKU & Description', 'Committed Qty', 'Agreed Deadline', 'Physical Audit', 'Deficit'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                  <div>{evaluationCase.primaryCustomer.customerName}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)' }}>{evaluationCase.primaryCustomer.orderId}</div>
                </td>
                <td style={{ padding: '0.65rem 0.75rem' }}>
                  <div>{evaluationCase.primaryCustomer.itemName}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)' }}>{evaluationCase.primaryCustomer.sku}</div>
                </td>
                <td className="tabular" style={{ padding: '0.65rem 0.75rem', fontWeight: 700 }}>{evaluationCase.primaryCustomer.orderedUnits} units</td>
                <td style={{ padding: '0.65rem 0.75rem', color: 'var(--oxide-red)', fontWeight: 600 }}>{evaluationCase.primaryCustomer.agreedDeadline}</td>
                <td className="tabular" style={{ padding: '0.65rem 0.75rem', color: 'var(--oxide-red)', fontWeight: 700 }}>{evaluationCase.physicalCountReported} available</td>
                <td className="tabular" style={{ padding: '0.65rem 0.75rem', color: 'var(--oxide-red)', fontWeight: 700 }}>-{evaluationCase.shortageUnits} units</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--rule)', background: 'var(--surface-subtle)' }}>
                <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                  <div>{evaluationCase.donorCustomer.customerName} (Donor Order)</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)' }}>{evaluationCase.donorCustomer.orderId}</div>
                </td>
                <td style={{ padding: '0.65rem 0.75rem' }}>
                  <div>{evaluationCase.donorCustomer.itemName}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)' }}>{evaluationCase.donorCustomer.sku}</div>
                </td>
                <td className="tabular" style={{ padding: '0.65rem 0.75rem' }}>{evaluationCase.donorCustomer.orderedUnits} units</td>
                <td style={{ padding: '0.65rem 0.75rem', color: 'var(--ink-secondary)' }}>{evaluationCase.donorCustomer.agreedDeadline}</td>
                <td className="tabular" style={{ padding: '0.65rem 0.75rem', color: 'var(--forest-green)', fontWeight: 600 }}>Reserved in Buffer</td>
                <td className="tabular" style={{ padding: '0.65rem 0.75rem' }}>0 (Protected)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Strategy Comparison Table */}
      <section className="ruled-box" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Available Recovery Strategies (Select One)
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginBottom: '1rem' }}>
          Review the financial and operational trade-offs for each strategy.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {evaluationCase.candidates.map(candidate => {
            const isSelected = candidate.candidateId === selectedCandidateId;
            return (
              <div
                key={candidate.candidateId}
                onClick={() => setSelectedCandidateId(candidate.candidateId)}
                style={{
                  padding: '1rem',
                  border: isSelected ? '2px solid var(--oxide-red)' : '1px solid var(--rule)',
                  background: isSelected ? 'var(--oxide-red-subtle)' : 'var(--surface)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <input
                      type="radio"
                      name="candidate-selection"
                      checked={isSelected}
                      onChange={() => setSelectedCandidateId(candidate.candidateId)}
                      style={{ accentColor: 'var(--oxide-red)' }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{candidate.title}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', padding: '0.2rem 0.5rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
                      Cutoff Req: {candidate.requiredCutoff}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', padding: '0.2rem 0.5rem', background: candidate.feasible ? 'var(--forest-green-subtle)' : 'var(--oxide-red-subtle)', color: candidate.feasible ? 'var(--forest-green)' : 'var(--oxide-red)', border: `1px solid ${candidate.feasible ? 'var(--forest-green)' : 'var(--oxide-red)'}` }}>
                      {candidate.feasible ? 'FEASIBLE' : 'INFEASIBLE'}
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)', marginBottom: '0.6rem', paddingLeft: '1.75rem' }}>
                  {candidate.description}
                </p>

                <div style={{ display: 'flex', gap: '1.25rem', paddingLeft: '1.75rem', flexWrap: 'wrap', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                  <span>Source Hub: <strong>{candidate.sourceHub}</strong></span>
                  <span>Freight Cost: <strong>{inr(candidate.freightCostInr)}</strong></span>
                  <span>SLA Penalty: <strong style={{ color: candidate.slaPenaltyInr > 0 ? 'var(--oxide-red)' : 'inherit' }}>{candidate.slaPenaltyInr > 0 ? inr(candidate.slaPenaltyInr) : '₹0'}</strong></span>
                  <span>Est. Margin: <strong style={{ color: candidate.remainingMarginInr > 0 ? 'var(--forest-green)' : 'var(--oxide-red)' }}>{inr(candidate.remainingMarginInr)}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cutoff Simulation & Dual-Customer Outcome Review */}
      <section className="ruled-box" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Dispatch Cutoff Validation &amp; Dual-Customer Verification
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginBottom: '1rem' }}>
          Simulate changing the truck cutoff time to confirm feasibility for <em>both</em> the primary requester and donor customer.
        </p>

        <form onSubmit={handleSimulate} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-secondary)', marginBottom: '0.3rem' }}>
              Planned Truck Cutoff Time (HH:MM)
            </label>
            <input
              type="text"
              value={testedCutoff}
              onChange={e => setTestedCutoff(e.target.value)}
              placeholder="16:00"
              style={{ width: '120px', padding: '0.45rem 0.6rem', border: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
            />
          </div>
          <button type="submit" className="btn-secondary" style={{ padding: '0.45rem 1rem' }}>
            Simulate Cutoff Impact
          </button>
        </form>

        {hasSimulated && (
          <div style={{ marginTop: '0.75rem', padding: '1rem', background: isCutoffSafe ? 'var(--forest-green-subtle)' : 'var(--oxide-red-subtle)', border: `1px solid ${isCutoffSafe ? 'var(--forest-green)' : 'var(--oxide-red)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {isCutoffSafe ? <CheckIcon size={18} color="var(--forest-green)" /> : <AlertIcon size={18} color="var(--oxide-red)" />}
              <span style={{ fontWeight: 700, color: isCutoffSafe ? 'var(--forest-green)' : 'var(--oxide-red)' }}>
                {isCutoffSafe
                  ? `CUTOFF SAFE (${testedCutoff} >= Required ${selectedCandidate.requiredCutoff})`
                  : `CUTOFF UNSAFE (${testedCutoff} is earlier than required ${selectedCandidate.requiredCutoff})`}
              </span>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--ink)', marginBottom: '0.75rem' }}>
              {isCutoffSafe
                ? `Primary customer (${selectedCandidate.primaryOutcome.customerName}) receives items by ${selectedCandidate.primaryOutcome.projectedArrival}. Donor order (${selectedCandidate.donorOutcome?.customerName || 'N/A'}) is protected.`
                : `Cutoff violation! Moving cutoff to ${testedCutoff} does not leave enough loading time at ${selectedCandidate.sourceHub}. Delivery will be delayed and donor replenishment window is broken.`}
            </p>

            {/* Dual outcome summary table */}
            <div style={{ background: 'var(--surface)', padding: '0.75rem', border: '1px solid var(--rule)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.82rem' }}>
                <div>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>Primary Customer Outcome</span>
                  <p style={{ fontWeight: 600, marginTop: '0.2rem' }}>{selectedCandidate.primaryOutcome.customerName}</p>
                  <p style={{ color: isCutoffSafe && selectedCandidate.primaryOutcome.onTime ? 'var(--forest-green)' : 'var(--oxide-red)', fontWeight: 700 }}>
                    {isCutoffSafe && selectedCandidate.primaryOutcome.onTime ? 'On-Time Arrival' : 'Late Arrival (SLA Missed)'} ({selectedCandidate.primaryOutcome.projectedArrival})
                  </p>
                </div>
                {selectedCandidate.donorOutcome && (
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>Donor Customer Outcome</span>
                    <p style={{ fontWeight: 600, marginTop: '0.2rem' }}>{selectedCandidate.donorOutcome.customerName}</p>
                    <p style={{ color: isCutoffSafe ? 'var(--forest-green)' : 'var(--oxide-red)', fontWeight: 700 }}>
                      {isCutoffSafe ? 'Promise Preserved' : 'Donor Promise Broken'} ({selectedCandidate.donorOutcome.projectedArrival})
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Submit decision */}
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={disabled}
            style={{ padding: '0.6rem 1.5rem', fontSize: '0.9rem' }}
          >
            Confirm Decision with {selectedCandidate.title}
          </button>
        </div>
      </section>
    </div>
  );
};
