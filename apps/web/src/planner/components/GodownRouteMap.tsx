import React from 'react';
import { PlannerOrder } from '../types/planner.ts';
import { GODOWN_NODES } from '../fixtures/plannerData.ts';
import { CheckIcon, AlertIcon, TruckIcon } from '../../shared/icons.tsx';

interface GodownRouteMapProps {
  order: PlannerOrder;
  onSelectCandidate: (candidateId: string) => void;
}

export const GodownRouteMap: React.FC<GodownRouteMapProps> = ({
  order,
  onSelectCandidate
}) => {
  const selected = order.candidates.find(c => c.candidateId === order.selectedCandidateId) || order.candidates[0];
  const nodeMap = new Map(GODOWN_NODES.map(n => [n.id, n]));

  return (
    <section className="ruled-box" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
          Interactive Godown Route Map &amp; Recovery Candidates
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
          Select a recovery candidate to highlight active shipment legs, source plants, and affected customers.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
        {/* Candidate Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {order.candidates.map(cand => {
            const isSelected = cand.candidateId === selected?.candidateId;
            return (
              <button
                key={cand.candidateId}
                type="button"
                onClick={() => onSelectCandidate(cand.candidateId)}
                style={{
                  textAlign: 'left',
                  padding: '0.85rem 1rem',
                  border: isSelected ? '2px solid var(--oxide-red)' : '1px solid var(--rule-dark)',
                  background: isSelected ? 'var(--oxide-red-subtle)' : 'var(--surface)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink)' }}>
                    {cand.title}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '0.1rem 0.4rem',
                    color: cand.feasible ? 'var(--forest-green)' : 'var(--oxide-red)',
                    background: cand.feasible ? 'var(--forest-green-subtle)' : 'var(--oxide-red-subtle)',
                    border: `1px solid ${cand.feasible ? 'var(--forest-green)' : 'var(--oxide-red)'}`
                  }}>
                    {cand.feasible ? 'FEASIBLE' : 'INFEASIBLE'}
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)', marginBottom: '0.35rem' }}>
                  {cand.summary}
                </p>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
                  SOURCE: {cand.sourcePlant} · MIN CUTOFF: {cand.cutoffRequired}
                </div>
              </button>
            );
          })}
        </div>

        {/* Interactive SVG Route Map + Highlighted Legs */}
        <div style={{ border: '1px solid var(--rule-dark)', background: 'var(--canvas)', padding: '0.85rem' }}>
          <svg viewBox="0 0 430 275" style={{ width: '100%', height: 'auto', display: 'block', background: 'var(--surface)', border: '1px solid var(--rule)' }} role="img" aria-label="Godown dispatch route map">
            {/* Base faint network edges */}
            <line x1="95" y1="125" x2="245" y2="95" stroke="#E7E5E4" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="115" y1="235" x2="245" y2="95" stroke="#E7E5E4" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="260" y1="225" x2="245" y2="95" stroke="#E7E5E4" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="95" y1="125" x2="195" y2="38" stroke="#E7E5E4" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="115" y1="235" x2="350" y2="145" stroke="#E7E5E4" strokeWidth="1.5" strokeDasharray="4 4" />

            {/* Highlighted active candidate legs */}
            {selected?.routeLegs.map(leg => {
              const from = nodeMap.get(leg.fromNodeId);
              const to = nodeMap.get(leg.toNodeId);
              if (!from || !to) return null;
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2 - 8;
              return (
                <g key={leg.legId}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="#991B1B"
                    strokeWidth="3"
                  />
                  <rect x={midX - 22} y={midY - 9} width="44" height="16" fill="#FAF8F5" stroke="#991B1B" strokeWidth="1" />
                  <text x={midX} y={midY + 2} textAnchor="middle" fontSize="9" fontWeight="700" fill="#991B1B" fontFamily="monospace">
                    {leg.units}u
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {GODOWN_NODES.map(node => {
              const isHighlighted = selected?.highlightedNodeIds.includes(node.id);
              const fill = node.kind === 'customer'
                ? (isHighlighted ? '#14532D' : '#FFFFFF')
                : (isHighlighted ? '#991B1B' : '#F5F3EF');
              const stroke = isHighlighted ? '#18181B' : '#D6D3D1';
              const textColor = isHighlighted ? '#FFFFFF' : '#18181B';
              return (
                <g key={node.id}>
                  <rect
                    x={node.x - 52}
                    y={node.y - 16}
                    width="104"
                    height="32"
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isHighlighted ? 2 : 1}
                  />
                  <text x={node.x} y={node.y - 1} textAnchor="middle" fontSize="10" fontWeight="700" fill={textColor} fontFamily="sans-serif">
                    {node.label}
                  </text>
                  <text x={node.x} y={node.y + 11} textAnchor="middle" fontSize="8" fill={textColor} fontFamily="monospace">
                    {node.kind.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </svg>

          {selected && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                {selected.feasible ? <CheckIcon size={14} color="var(--forest-green)" /> : <AlertIcon size={14} color="var(--oxide-red)" />}
                <span>Affected Customers: {selected.affectedCustomerLabels.join(' · ')}</span>
              </div>
              {selected.routeLegs.map(leg => (
                <div key={leg.legId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderTop: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <TruckIcon size={12} color="var(--oxide-red)" />
                    {leg.fromLabel} → {leg.toLabel}
                  </span>
                  <span className="tabular">{leg.units} {order.unitLabel} ({leg.departTime}–{leg.arriveTime})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
