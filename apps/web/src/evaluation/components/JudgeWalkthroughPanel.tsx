import React, { useState } from 'react';

interface WalkthroughStep {
  number: number;
  title: string;
  narrative: string;
  uiLocation: string;
  actionUrl: string;
  verificationBadge: 'FIXTURE-VERIFIED' | 'LIVE-VERIFIED' | 'PENDING';
  details: string[];
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    number: 1,
    title: 'Physical Audit Correction (50 → 40 Units)',
    narrative:
      'Warehouse manager at Udupi depot performs bin audit and updates inventory from 50 to 40 fans. Backlog risk spikes to 78%, and telemetry feed warns of physical discrepancy.',
    uiLocation: 'Customer Portal & Planner Telemetry Strip',
    actionUrl: '#/planner/orders/ORD-2026-MANIPAL-50',
    verificationBadge: 'LIVE-VERIFIED',
    details: [
      'Inventory event ingested via P1 stock engine',
      'Telemetry alert: "Udupi bin-audit telemetry is 22 min old"',
      'Backlog units: 10 units deficit recorded'
    ]
  },
  {
    number: 2,
    title: 'Customer Insists on Friday Deadline',
    narrative:
      'Customer receives a split offer (40 Friday + 10 Sunday). Customer chooses "Insist on Original Terms" for an opening event. Order transitions to Recovery Pending while preserving original promise.',
    uiLocation: 'Customer Order Portal',
    actionUrl: '#/customer/orders/ORD-2026-MANIPAL-50',
    verificationBadge: 'FIXTURE-VERIFIED',
    details: [
      'Summary display: "40 of 50 units offered" before acceptance',
      'Clicking "Insist on Original Terms" prevents stock hallucination',
      'Original promise preserved; escalated to planner control tower'
    ]
  },
  {
    number: 3,
    title: 'Planner Cutoff Simulation (Safe vs Unsafe)',
    narrative:
      'Planner selects Mangalore buffer swap (donor: Kundapura #7). Testing cutoff at 16:30 proves feasible for BOTH orders. Changing cutoff to 14:30 reports exact dual-order failure and strictly blocks approval.',
    uiLocation: 'Interactive Godown Map & Cutoff Panel',
    actionUrl: '#/planner/orders/ORD-2026-MANIPAL-50',
    verificationBadge: 'FIXTURE-VERIFIED',
    details: [
      'Cutoff >= 16:00: Green feasible banner (both customers on-time)',
      'Cutoff 14:30: Red infeasible banner + donor replenishment broken',
      'Saved plan allocations remain 100% non-mutated during simulations'
    ]
  },
  {
    number: 4,
    title: 'Feasible Approval & P4 Case Steering',
    narrative:
      'Setting cutoff back to 16:30 enables version-locked approval, resolving order. P4 steering slider smoothly interpolates query embedding scores and displays role briefings.',
    uiLocation: 'Recovery Approval & Historical Case Panel',
    actionUrl: '#/planner/orders/ORD-2026-MANIPAL-50',
    verificationBadge: 'FIXTURE-VERIFIED',
    details: [
      'Versioned approval increments order version and clears backlog',
      'P4 Steering slider (0–100) dynamically rescales 2D SVG embedding plot',
      'Clicking points shows evidence references (e.g. LOG-2025-089-EV) and tabbed briefings'
    ]
  },
  {
    number: 5,
    title: 'Purchasing Review (Independent PO & Email)',
    narrative:
      'Shortage review card shows supplier ETA and price. PO creation and supplier email dispatch each require separate explicit approvals and produce independent audit receipts.',
    uiLocation: 'Purchasing Review Panel',
    actionUrl: '#/planner/orders/ORD-2026-MANIPAL-50',
    verificationBadge: 'FIXTURE-VERIFIED',
    details: [
      'Step 1: "Create Purchase Order…" with preview modal → PO #PO-2026-8841-A',
      'Step 2: "Send Supplier Email…" unlocks only after PO exists → Message #MSG-SUPP-8841',
      'Full audit timestamps and approver identity persisted'
    ]
  }
];

export const JudgeWalkthroughPanel: React.FC = () => {
  const [activeStep, setActiveStep] = useState<number>(1);

  const step = WALKTHROUGH_STEPS.find(s => s.number === activeStep) || WALKTHROUGH_STEPS[0];

  return (
    <section className="ruled-box" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          HACKATHON PRESENTATION GUIDE · JUDGE DEMO WALKTHROUGH
        </p>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, textTransform: 'uppercase' }}>
          5-Step End-to-End Walkthrough Guide
        </h2>
        <p style={{ fontSize: '0.86rem', color: 'var(--ink-secondary)' }}>
          Step-by-step narrative script demonstrating inventory disruption, dual-customer cutoff challenge, and resolution.
        </p>
      </div>

      {/* Step Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
        {WALKTHROUGH_STEPS.map(s => (
          <button
            key={s.number}
            type="button"
            onClick={() => setActiveStep(s.number)}
            style={{
              padding: '0.5rem 0.85rem',
              background: activeStep === s.number ? 'var(--ink)' : 'var(--surface-subtle)',
              color: activeStep === s.number ? 'var(--surface)' : 'var(--ink)',
              border: '1px solid var(--rule)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Step {s.number}: {s.title.split('(')[0].trim()}
          </button>
        ))}
      </div>

      {/* Active Step Details */}
      <div style={{ padding: '1.25rem', background: 'var(--surface-subtle)', border: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
              STEP {step.number} OF 5
            </span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, textTransform: 'uppercase', marginTop: '0.2rem' }}>
              {step.title}
            </h3>
            <p style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-secondary)', marginTop: '0.2rem' }}>
              UI Target: {step.uiLocation}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '0.25rem 0.6rem',
                background: step.verificationBadge === 'LIVE-VERIFIED' ? 'var(--forest-green-subtle)' : 'var(--oxide-red-subtle)',
                color: step.verificationBadge === 'LIVE-VERIFIED' ? 'var(--forest-green)' : 'var(--oxide-red)',
                border: `1px solid ${step.verificationBadge === 'LIVE-VERIFIED' ? 'var(--forest-green)' : 'var(--oxide-red)'}`
              }}
            >
              [{step.verificationBadge}]
            </span>
            <a
              href={step.actionUrl}
              className="btn-primary"
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem', textDecoration: 'none' }}
            >
              Jump to Screen →
            </a>
          </div>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--ink)', marginBottom: '1rem', lineHeight: 1.55 }}>
          {step.narrative}
        </p>

        <div style={{ background: 'var(--surface)', padding: '0.85rem 1rem', border: '1px solid var(--rule)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            Key Verification Highlights:
          </p>
          <ul style={{ paddingLeft: '1.25rem', fontSize: '0.84rem', color: 'var(--ink-secondary)', lineHeight: 1.6 }}>
            {step.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
