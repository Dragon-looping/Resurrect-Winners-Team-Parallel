import React, { useCallback, useEffect, useState } from 'react';
import { ActorCredentials, procurementAdapter } from '../adapters/procurementAdapter.ts';
import {
  AuditLogEntry,
  EmailLog,
  EmailPreview,
  OperationalBriefing,
  ProcurementDashboard,
  ProcurementRole,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseProposal,
  ShortageAlert,
} from '../types/procurement.ts';
import { AlertIcon, CheckIcon } from '../../shared/icons.tsx';

type TabKey =
  | 'dashboard'
  | 'shortages'
  | 'proposals'
  | 'approvals'
  | 'orders'
  | 'emails'
  | 'briefings';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: '1. Dashboard' },
  { key: 'shortages', label: '2. Shortages' },
  { key: 'proposals', label: '3. Proposals' },
  { key: 'approvals', label: '4. Approval Center' },
  { key: 'orders', label: '5. Purchase Orders' },
  { key: 'emails', label: '6. Supplier Email' },
  { key: 'briefings', label: '7. AI Briefings' },
];

function formatInr(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadgeStyle(status: string): React.CSSProperties {
  if (status === 'CRITICAL' || status === 'REJECTED' || status === 'FAILED' || status === 'CANCELLED') {
    return { background: 'var(--oxide-red-subtle)', color: 'var(--oxide-red)', border: '1px solid var(--oxide-red)' };
  }
  if (status === 'APPROVED' || status === 'SENT' || status === 'FULFILLED' || status === 'ACKNOWLEDGED') {
    return { background: 'var(--forest-green-subtle)', color: 'var(--forest-green)', border: '1px solid var(--forest-green)' };
  }
  return { background: 'var(--surface-subtle)', color: 'var(--ink-secondary)', border: '1px solid var(--rule)' };
}

export const ProcurementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [actorId, setActorId] = useState<string>('ananya.rao');
  const [actorRole, setActorRole] = useState<ProcurementRole>('PROCUREMENT_OFFICER');

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<ProcurementDashboard | null>(null);
  const [shortages, setShortages] = useState<ShortageAlert[]>([]);
  const [proposals, setProposals] = useState<PurchaseProposal[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<PurchaseProposal[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [emailCustomNote, setEmailCustomNote] = useState<string>('');
  const [humanEmailConfirmed, setHumanEmailConfirmed] = useState<boolean>(false);

  const [briefingTargetRole, setBriefingTargetRole] = useState<ProcurementRole>('PROCUREMENT_OFFICER');
  const [briefing, setBriefing] = useState<OperationalBriefing | null>(null);

  const actor: ActorCredentials = { actorId: actorId.trim() || 'operator', actorRole };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [dash, sh, props, queue, pos, emails, audits] = await Promise.all([
        procurementAdapter.getDashboard(actor),
        procurementAdapter.getShortages(actor),
        procurementAdapter.getProposals(actor),
        procurementAdapter.getApprovalQueue(actor),
        procurementAdapter.getPurchaseOrders(actor),
        procurementAdapter.getEmailLogs(actor),
        procurementAdapter.getAuditLogs(actor),
      ]);
      setDashboard(dash);
      setShortages(sh);
      setProposals(props);
      setApprovalQueue(queue);
      setPurchaseOrders(pos);
      setEmailLogs(emails);
      setAuditLogs(audits);
      if (props.length > 0 && selectedProposalId === null) {
        setSelectedProposalId(props[0].id);
      }
      if (pos.length > 0 && selectedPoId === null) {
        setSelectedPoId(pos[0].id);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load procurement workspace.');
    } finally {
      setLoading(false);
    }
  }, [actorId, actorRole]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const selectedProposal = proposals.find((p) => p.id === selectedProposalId) || proposals[0] || null;
  const activePoId = selectedPoId ?? purchaseOrders[0]?.id ?? null;

  async function runAction(label: string, fn: () => Promise<void>) {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await fn();
      setSuccessMsg(label);
      await loadAll();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setLoading(false);
    }
  }

  function downloadPreviewEml(preview: EmailPreview) {
    const content = `To: ${preview.recipient_name} <${preview.recipient_email}>\nSubject: ${preview.subject}\nContent-Type: text/plain; charset=utf-8\n\n${preview.body_text}`;
    const blob = new Blob([content], { type: 'message/rfc822;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preview.po_number}.eml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header & Actor Context Bar */}
      <section className="ruled-box" style={{ padding: '1.25rem 1.5rem', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
              BRANCH 3 · PROCUREMENT, HUMAN APPROVALS, PURCHASE ORDERS & ROLE BRIEFINGS
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, textTransform: 'uppercase', marginTop: '0.2rem' }}>
              Procurement & Operational Intelligence
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.6rem 0.85rem', border: '1px solid var(--rule)', background: 'var(--surface-subtle)' }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--ink-muted)' }}>ACTOR ID</label>
              <input
                type="text"
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
                style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', width: '130px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--ink-muted)' }}>ROLE</label>
              <select
                value={actorRole}
                onChange={(e) => setActorRole(e.target.value as ProcurementRole)}
                style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
              >
                <option value="PROCUREMENT_OFFICER">PROCUREMENT_OFFICER</option>
                <option value="WAREHOUSE_MANAGER">WAREHOUSE_MANAGER</option>
                <option value="ADMINISTRATOR">ADMINISTRATOR</option>
                <option value="AI_SYSTEM">AI_SYSTEM (Restricted)</option>
              </select>
            </div>
            <button
              onClick={() => loadAll()}
              disabled={loading}
              style={{ padding: '0.45rem 0.85rem', border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--surface)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.8rem' }}
            >
              {loading ? 'Syncing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Workspace Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.1rem', borderTop: '1px solid var(--rule)', paddingTop: '0.85rem' }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.8rem',
                  fontWeight: active ? 700 : 500,
                  border: active ? '1px solid var(--oxide-red)' : '1px solid var(--rule)',
                  background: active ? 'var(--oxide-red)' : 'var(--canvas)',
                  color: active ? '#fff' : 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {errorMsg && (
        <div style={{ padding: '0.85rem 1rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', color: 'var(--oxide-red)', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <AlertIcon size={18} color="var(--oxide-red)" />
          <span style={{ fontWeight: 600 }}>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div style={{ padding: '0.85rem 1rem', background: 'var(--forest-green-subtle)', border: '1px solid var(--forest-green)', color: 'var(--forest-green)', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <CheckIcon size={18} color="var(--forest-green)" />
          <span style={{ fontWeight: 600 }}>{successMsg}</span>
        </div>
      )}

      {/* 1. PROCUREMENT DASHBOARD */}
      {activeTab === 'dashboard' && dashboard && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {[
              { label: 'Active Shortages', value: String(dashboard.active_shortages_count), sub: `${dashboard.critical_shortages_count} critical` },
              { label: 'Pending Approval Exposure', value: formatInr(dashboard.pending_approval_exposure_inr), sub: `${dashboard.proposals_by_status.PENDING_APPROVAL || 0} in queue` },
              { label: 'Committed PO Exposure', value: formatInr(dashboard.total_approved_exposure_inr), sub: `${purchaseOrders.length} total POs` },
              { label: 'Supplier Email Integration', value: dashboard.email_integration_configured ? 'CONFIGURED' : 'NOT CONFIGURED', sub: `${dashboard.emails_sent_count} emails sent` },
            ].map((kpi) => (
              <div key={kpi.label} className="ruled-box" style={{ padding: '1rem 1.25rem', background: 'var(--surface)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>{kpi.label}</div>
                <div className="tabular" style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, marginTop: '0.25rem' }}>{kpi.value}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', marginTop: '0.2rem' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          <div className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Recent Procurement Audit Trail
            </h2>
            {auditLogs.length === 0 ? (
              <p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem' }}>No audit events recorded yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--rule)', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
                      <th style={{ padding: '0.5rem' }}>TIMESTAMP</th>
                      <th style={{ padding: '0.5rem' }}>ENTITY</th>
                      <th style={{ padding: '0.5rem' }}>ACTION</th>
                      <th style={{ padding: '0.5rem' }}>ACTOR</th>
                      <th style={{ padding: '0.5rem' }}>ROLE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.slice(0, 12).map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                        <td className="tabular" style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)' }}>{new Date(log.created_at).toLocaleString()}</td>
                        <td style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)' }}>{log.entity_type} · {log.entity_id}</td>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{log.action}</td>
                        <td style={{ padding: '0.5rem' }}>{log.actor_id}</td>
                        <td style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)' }}>{log.actor_role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 2. SHORTAGE MANAGEMENT */}
      {activeTab === 'shortages' && (
        <section className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            Shortage Management (Connected to Fulfilment Risk Engine)
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)', marginBottom: '1rem' }}>
            Live shortages from existing inventory & order backlog risk assessment. Duplicate active proposals are blocked automatically.
          </p>
          {shortages.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>No active shortages detected across current orders.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--rule)', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
                    <th style={{ padding: '0.55rem' }}>REF / ORDER</th>
                    <th style={{ padding: '0.55rem' }}>ITEM & PLANT</th>
                    <th style={{ padding: '0.55rem' }}>REQ / AVAIL / SHORT</th>
                    <th style={{ padding: '0.55rem' }}>URGENCY</th>
                    <th style={{ padding: '0.55rem' }}>DEPARTMENTS</th>
                    <th style={{ padding: '0.55rem' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {shortages.map((s) => (
                    <tr key={s.shortage_ref} style={{ borderBottom: '1px solid var(--rule)' }}>
                      <td style={{ padding: '0.55rem' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{s.shortage_ref}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>{s.order_number} · {s.customer_name}</div>
                      </td>
                      <td style={{ padding: '0.55rem' }}>
                        <div style={{ fontWeight: 600 }}>{s.sku_name} ({s.sku_code})</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>{s.plant_name}</div>
                      </td>
                      <td className="tabular" style={{ padding: '0.55rem', fontFamily: 'var(--font-mono)' }}>
                        {s.required_quantity} / {s.available_quantity} / <strong style={{ color: 'var(--oxide-red)' }}>{s.shortage_quantity} {s.unit}</strong>
                      </td>
                      <td style={{ padding: '0.55rem' }}>
                        <span style={{ ...statusBadgeStyle(s.urgency_level), padding: '0.15rem 0.45rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          {s.urgency_level} ({s.severity_score})
                        </span>
                      </td>
                      <td style={{ padding: '0.55rem', fontSize: '0.78rem' }}>{s.affected_departments.join(', ')}</td>
                      <td style={{ padding: '0.55rem' }}>
                        {s.has_active_proposal ? (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--forest-green)', fontWeight: 600 }}>
                            Active: {s.active_proposal_code}
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              runAction(`Generated AI proposal for ${s.shortage_ref}`, async () => {
                                const created = await procurementAdapter.generateProposal(actor, s.shortage_ref);
                                setSelectedProposalId(created.id);
                                setActiveTab('proposals');
                              })
                            }
                            style={{ padding: '0.35rem 0.7rem', background: 'var(--ink)', color: '#fff', border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Generate AI Proposal
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 3. PURCHASE PROPOSAL WORKSPACE */}
      {activeTab === 'proposals' && (
        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(360px, 2fr)', gap: '1.25rem' }}>
          <div className="ruled-box" style={{ padding: '1rem', background: 'var(--surface)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Proposals ({proposals.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {proposals.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProposalId(p.id)}
                  style={{
                    textAlign: 'left',
                    padding: '0.65rem',
                    border: selectedProposal?.id === p.id ? '2px solid var(--oxide-red)' : '1px solid var(--rule)',
                    background: 'var(--canvas)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    <strong>{p.proposal_code}</strong>
                    <span>{p.status}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, marginTop: '0.2rem' }}>{p.sku_name}</div>
                  <div className="tabular" style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
                    {p.recommended_quantity} {p.unit} · {formatInr(p.estimated_total_price)}
                  </div>
                </button>
              ))}
              {proposals.length === 0 && <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)' }}>No proposals generated yet.</p>}
            </div>
          </div>

          <div className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
            {!selectedProposal ? (
              <p style={{ color: 'var(--ink-muted)' }}>Select or generate a purchase proposal to inspect details.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--rule)', paddingBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                      {selectedProposal.shortage_ref} · v{selectedProposal.version}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700 }}>{selectedProposal.proposal_code}</h3>
                  </div>
                  <span style={{ ...statusBadgeStyle(selectedProposal.status), padding: '0.25rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700 }}>
                    {selectedProposal.status}
                  </span>
                </div>

                {/* Verified Facts */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.65rem' }}>
                  <div style={{ padding: '0.6rem', border: '1px solid var(--rule)', background: 'var(--surface-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>VERIFIED SHORTAGE</div>
                    <div className="tabular" style={{ fontWeight: 700 }}>{selectedProposal.shortage_quantity} {selectedProposal.unit}</div>
                  </div>
                  <div style={{ padding: '0.6rem', border: '1px solid var(--rule)', background: 'var(--surface-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>RECOMMENDED QTY</div>
                    <div className="tabular" style={{ fontWeight: 700 }}>{selectedProposal.recommended_quantity} {selectedProposal.unit}</div>
                  </div>
                  <div style={{ padding: '0.6rem', border: '1px solid var(--rule)', background: 'var(--surface-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>UNIT / TOTAL PRICE</div>
                    <div className="tabular" style={{ fontWeight: 700 }}>{formatInr(selectedProposal.estimated_unit_price)} / {formatInr(selectedProposal.estimated_total_price)}</div>
                  </div>
                  <div style={{ padding: '0.6rem', border: '1px solid var(--rule)', background: 'var(--surface-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-muted)' }}>PREFERRED SUPPLIER</div>
                    <div style={{ fontWeight: 700 }}>{selectedProposal.preferred_supplier.name}</div>
                  </div>
                </div>

                {/* AI Justification & Risk (Clearly marked as AI-generated) */}
                <div style={{ padding: '0.85rem', border: '1px solid var(--rule)', background: 'var(--canvas)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--oxide-red)', fontWeight: 700, marginBottom: '0.35rem' }}>
                    AI-GENERATED SUGGESTION ({selectedProposal.ai_execution_mode.toUpperCase()} · REQUIRES HUMAN APPROVAL)
                  </div>
                  <p style={{ fontSize: '0.88rem', marginBottom: '0.5rem' }}><strong>Justification:</strong> {selectedProposal.ai_justification}</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)' }}><strong>Risk Assessment:</strong> {selectedProposal.risk_assessment}</p>
                </div>

                {/* Supporting Historical Cases (Branch 2) */}
                {selectedProposal.historical_case_refs.length > 0 && (
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', marginBottom: '0.35rem' }}>
                      SUPPORTING HISTORICAL CASES (BRANCH 2 SIMILARITY SEARCH)
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
                      {selectedProposal.historical_case_refs.map((c) => (
                        <li key={c.case_id}>
                          <strong>{c.case_id}</strong> ({Math.round(c.similarity_score * 100)}% match): {c.title} — {c.outcome_summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedProposal.status === 'DRAFT' && (
                  <div>
                    <button
                      onClick={() =>
                        runAction(`Submitted ${selectedProposal.proposal_code} for human approval`, async () => {
                          await procurementAdapter.submitProposal(actor, selectedProposal.id, selectedProposal.version);
                          setActiveTab('approvals');
                        })
                      }
                      style={{ padding: '0.55rem 1rem', background: 'var(--oxide-red)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Submit for Human Approval
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4. APPROVAL CENTER */}
      {activeTab === 'approvals' && (
        <section className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Human Approval Center
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)', marginBottom: '1rem' }}>
            Only authorized human users (<code>PROCUREMENT_OFFICER</code> or <code>ADMINISTRATOR</code>) may approve or reject proposals. AI approval is blocked in the backend.
          </p>
          {approvalQueue.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)' }}>Approval queue is empty.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {approvalQueue.map((p) => (
                <div key={p.id} style={{ padding: '1rem', border: '1px solid var(--rule)', background: 'var(--canvas)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>{p.proposal_code}</strong> · {p.sku_name} ({p.recommended_quantity} {p.unit})
                      <div style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
                        Supplier: {p.preferred_supplier.name} · Total: <strong className="tabular">{formatInr(p.estimated_total_price)}</strong>
                      </div>
                    </div>
                    <span style={{ ...statusBadgeStyle(p.urgency_level), padding: '0.2rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                      {p.urgency_level}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.85rem' }}>
                    <button
                      onClick={() =>
                        runAction(`Approved ${p.proposal_code}`, async () => {
                          await procurementAdapter.approveProposal(actor, p.id, p.version, 'Approved via Approval Center');
                        })
                      }
                      style={{ padding: '0.45rem 0.9rem', background: 'var(--forest-green)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Approve Proposal
                    </button>
                    <input
                      type="text"
                      placeholder="Mandatory rejection reason..."
                      value={rejectReasons[p.id] || ''}
                      onChange={(e) => setRejectReasons((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      style={{ padding: '0.42rem 0.6rem', border: '1px solid var(--rule)', minWidth: '240px', fontSize: '0.84rem' }}
                    />
                    <button
                      onClick={() =>
                        runAction(`Rejected ${p.proposal_code}`, async () => {
                          await procurementAdapter.rejectProposal(actor, p.id, p.version, rejectReasons[p.id] || '');
                        })
                      }
                      style={{ padding: '0.45rem 0.9rem', background: 'var(--oxide-red)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 5. PURCHASE ORDERS */}
      {activeTab === 'orders' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {proposals.some((p) => p.status === 'APPROVED') && (
            <div className="ruled-box" style={{ padding: '1rem 1.25rem', background: 'var(--forest-green-subtle)' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Approved Proposals Ready for PO Generation</div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {proposals
                  .filter((p) => p.status === 'APPROVED')
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() =>
                        runAction(`Created Purchase Order for ${p.proposal_code}`, async () => {
                          const po = await procurementAdapter.createPurchaseOrder(actor, p.id);
                          setSelectedPoId(po.id);
                        })
                      }
                      style={{ padding: '0.45rem 0.85rem', background: 'var(--forest-green)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Generate PO for {p.proposal_code} ({formatInr(p.estimated_total_price)})
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Purchase Orders ({purchaseOrders.length})
            </h2>
            {purchaseOrders.length === 0 ? (
              <p style={{ color: 'var(--ink-muted)' }}>No Purchase Orders created yet. Approve a proposal first.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--rule)', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
                      <th style={{ padding: '0.5rem' }}>PO NUMBER</th>
                      <th style={{ padding: '0.5rem' }}>SUPPLIER</th>
                      <th style={{ padding: '0.5rem' }}>SKU & QTY</th>
                      <th style={{ padding: '0.5rem' }}>TOTAL</th>
                      <th style={{ padding: '0.5rem' }}>STATUS</th>
                      <th style={{ padding: '0.5rem' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseOrders.map((po) => (
                      <tr key={po.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                        <td style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          {po.po_number}
                          <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>{po.approval_reference}</div>
                        </td>
                        <td style={{ padding: '0.5rem' }}>{po.supplier_name}</td>
                        <td className="tabular" style={{ padding: '0.5rem' }}>{po.sku_code} · {po.approved_quantity} {po.unit}</td>
                        <td className="tabular" style={{ padding: '0.5rem', fontWeight: 700 }}>{formatInr(po.total_amount)}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{ ...statusBadgeStyle(po.status), padding: '0.15rem 0.45rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                            {po.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {po.status === 'CREATED' && (
                            <button
                              onClick={() =>
                                runAction(`Marked ${po.po_number} READY_TO_SEND`, async () => {
                                  await procurementAdapter.updatePurchaseOrderStatus(actor, po.id, 'READY_TO_SEND' as PurchaseOrderStatus, po.version);
                                })
                              }
                              style={{ padding: '0.3rem 0.55rem', border: '1px solid var(--rule)', background: 'var(--canvas)', fontSize: '0.76rem', cursor: 'pointer' }}
                            >
                              Ready to Send
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedPoId(po.id);
                              setEmailPreview(null);
                              setHumanEmailConfirmed(false);
                              setActiveTab('emails');
                            }}
                            style={{ padding: '0.3rem 0.55rem', background: 'var(--ink)', color: '#fff', border: 'none', fontSize: '0.76rem', cursor: 'pointer' }}
                          >
                            Email Workflow
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 6. SUPPLIER COMMUNICATION */}
      {activeTab === 'emails' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Supplier Email Preview & Human-Confirmed Dispatch
            </h2>
            {purchaseOrders.length === 0 ? (
              <p style={{ color: 'var(--ink-muted)' }}>Create a Purchase Order before previewing supplier emails.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={activePoId ?? ''}
                    onChange={(e) => {
                      setSelectedPoId(Number(e.target.value));
                      setEmailPreview(null);
                      setHumanEmailConfirmed(false);
                    }}
                    style={{ padding: '0.45rem 0.65rem', border: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}
                  >
                    {purchaseOrders.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.po_number} — {po.supplier_name} ({po.supplier_email})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Optional supplier instruction note..."
                    value={emailCustomNote}
                    onChange={(e) => setEmailCustomNote(e.target.value)}
                    style={{ padding: '0.45rem 0.65rem', border: '1px solid var(--rule)', minWidth: '240px', fontSize: '0.84rem' }}
                  />
                  <button
                    onClick={() =>
                      activePoId &&
                      runAction('Generated supplier email preview', async () => {
                        const prev = await procurementAdapter.previewSupplierEmail(actor, activePoId, emailCustomNote);
                        setEmailPreview(prev);
                      })
                    }
                    style={{ padding: '0.45rem 0.9rem', background: 'var(--ink)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Generate Email Preview
                  </button>
                </div>

                {emailPreview && (
                  <div style={{ padding: '1rem', border: '1px solid var(--rule)', background: 'var(--canvas)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <div><strong>To:</strong> {emailPreview.recipient_name} &lt;{emailPreview.recipient_email}&gt;</div>
                        <div><strong>Subject:</strong> {emailPreview.subject}</div>
                      </div>
                      <span style={{ ...statusBadgeStyle(emailPreview.smtp_host_configured ? 'SENT' : 'CRITICAL'), padding: '0.25rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700 }}>
                        SMTP: {emailPreview.integration_status}
                      </span>
                    </div>

                    {!emailPreview.smtp_host_configured && (
                      <div style={{ padding: '0.65rem', background: 'var(--oxide-red-subtle)', border: '1px solid var(--oxide-red)', fontSize: '0.82rem' }}>
                        Email credentials (<code>SMTP_HOST</code> / <code>SMTP_FROM_EMAIL</code>) are not configured. You can copy or download the email below. Sending will honestly report unconfigured status without pretending dispatch succeeded.
                      </div>
                    )}

                    <pre style={{ padding: '0.85rem', background: '#fff', border: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'pre-wrap', margin: 0 }}>
                      {emailPreview.body_text}
                    </pre>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        onClick={() => navigator.clipboard?.writeText(emailPreview.body_text)}
                        style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--rule)', background: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
                      >
                        Copy Email Body
                      </button>
                      <button
                        onClick={() => downloadPreviewEml(emailPreview)}
                        style={{ padding: '0.4rem 0.75rem', border: '1px solid var(--rule)', background: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
                      >
                        Download .eml
                      </button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={humanEmailConfirmed}
                          onChange={(e) => setHumanEmailConfirmed(e.target.checked)}
                        />
                        I confirm this Purchase Order email is accurate and ready to send
                      </label>
                      <button
                        disabled={!humanEmailConfirmed}
                        onClick={() =>
                          activePoId &&
                          runAction('Recorded confirmed email dispatch attempt', async () => {
                            await procurementAdapter.sendSupplierEmail(actor, activePoId, humanEmailConfirmed, emailCustomNote);
                          })
                        }
                        style={{
                          padding: '0.45rem 0.9rem',
                          background: humanEmailConfirmed ? 'var(--forest-green)' : 'var(--rule)',
                          color: humanEmailConfirmed ? '#fff' : 'var(--ink-muted)',
                          border: 'none',
                          fontWeight: 700,
                          cursor: humanEmailConfirmed ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Confirm & Send Email
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.65rem' }}>
              Delivery Attempt History ({emailLogs.length})
            </h3>
            {emailLogs.length === 0 ? (
              <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>No email previews or dispatch attempts recorded yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--rule)', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
                    <th style={{ padding: '0.45rem' }}>RECIPIENT</th>
                    <th style={{ padding: '0.45rem' }}>SUBJECT</th>
                    <th style={{ padding: '0.45rem' }}>STATUS</th>
                    <th style={{ padding: '0.45rem' }}>CONFIRMED BY</th>
                    <th style={{ padding: '0.45rem' }}>NOTE / ERROR</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                      <td style={{ padding: '0.45rem' }}>{log.recipient_email}</td>
                      <td style={{ padding: '0.45rem' }}>{log.subject}</td>
                      <td style={{ padding: '0.45rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{log.delivery_status}</td>
                      <td style={{ padding: '0.45rem' }}>{log.confirmed_by || '—'}</td>
                      <td style={{ padding: '0.45rem', color: 'var(--ink-secondary)' }}>{log.error_message || log.provider_message_id || 'Previewed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* 7. ROLE-SPECIFIC AI BRIEFINGS */}
      {activeTab === 'briefings' && (
        <section className="ruled-box" style={{ padding: '1.25rem', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Role-Specific AI Operational Briefings
              </h2>
              <p style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
                Grounded strictly in live database records via Branch 1 AI Gateway. Permissions enforced per role.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <select
                value={briefingTargetRole}
                onChange={(e) => setBriefingTargetRole(e.target.value as ProcurementRole)}
                style={{ padding: '0.45rem 0.65rem', border: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
              >
                <option value="WAREHOUSE_MANAGER">WAREHOUSE_MANAGER</option>
                <option value="PROCUREMENT_OFFICER">PROCUREMENT_OFFICER</option>
                <option value="ADMINISTRATOR">ADMINISTRATOR</option>
              </select>
              <button
                onClick={() =>
                  runAction(`Generated ${briefingTargetRole} briefing`, async () => {
                    const res = await procurementAdapter.generateBriefing(actor, briefingTargetRole);
                    setBriefing(res);
                  })
                }
                style={{ padding: '0.45rem 0.9rem', background: 'var(--oxide-red)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
              >
                Generate Briefing
              </button>
            </div>
          </div>

          {briefing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--rule)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
                <span>ROLE: {briefing.role} · MODE: {briefing.ai_execution_mode.toUpperCase()} {briefing.fallback_used ? '(FALLBACK)' : ''}</span>
                <span>GENERATED: {new Date(briefing.generated_at).toLocaleString()}</span>
              </div>
              <div style={{ padding: '0.9rem', background: 'var(--canvas)', border: '1px solid var(--rule)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', marginBottom: '0.3rem' }}>EXECUTIVE SUMMARY</div>
                <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.5 }}>{briefing.executive_summary}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                <div style={{ padding: '0.85rem', border: '1px solid var(--rule)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', marginBottom: '0.4rem' }}>CRITICAL OBSERVATIONS</div>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.84rem' }}>
                    {briefing.critical_observations.map((obs, idx) => (
                      <li key={idx} style={{ marginBottom: '0.25rem' }}>{obs}</li>
                    ))}
                  </ul>
                </div>
                <div style={{ padding: '0.85rem', border: '1px solid var(--rule)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', marginBottom: '0.4rem' }}>RECOMMENDED ACTIONS</div>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.84rem' }}>
                    {briefing.recommended_actions.map((act, idx) => (
                      <li key={idx} style={{ marginBottom: '0.25rem' }}>{act}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {briefing.priority_ranked_issues.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink-muted)', marginBottom: '0.4rem' }}>PRIORITY-RANKED ISSUES & EVIDENCE</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {briefing.priority_ranked_issues.map((issue) => (
                      <div key={`${issue.priority}-${issue.evidence_ref}`} style={{ padding: '0.65rem 0.85rem', border: '1px solid var(--rule)', background: 'var(--surface-subtle)' }}>
                        <strong>#{issue.priority} [{issue.severity}] {issue.title}</strong> — {issue.detail}{' '}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>({issue.evidence_ref})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
