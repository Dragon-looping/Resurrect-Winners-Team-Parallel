import React from 'react';
import {InventoryEvidence} from './InventoryEvidence.tsx';
import type {PurchaseProposal, PurchaseOrder, EmailLog} from '../types/procurement.ts';

const symbols = {
  dashboard:'M3 3h7v7H3z M14 3h7v4h-7z M14 11h7v10h-7z M3 14h7v7H3z',
  shortages:'M3 20 12 4l9 16z M12 9v5m0 2v1',
  proposals:'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8m-8 4h6',
  approvals:'M5 16h14l2 4H3z M9 16v-3c0-2 1-3 1-5a3 3 0 1 1 4 0c0 2 1 3 1 5v3',
  orders:'M5 3h14v18l-3-2-4 2-4-2-3 2z M8 7h8m-8 4h8m-8 4h4',
  emails:'M3 5h18v14H3z M3 6l9 7 9-7',
  briefings:'M3 20h18 M5 16v-4m5 4V8m5 8v-5 M15 5l2-3 1 3 3 1-3 1-1 3-2-3-2-1z',
};
export function ProcurementIcon({name}: {name:keyof typeof symbols}) {
  return <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" strokeLinecap="round"><path d={symbols[name]}/></svg>;
}
export function formatInr(amount: number) {
  return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(amount);
}
export function PurchaseDocument({p, po, email, children}: {p:PurchaseProposal; po?:PurchaseOrder; email?:EmailLog; children:React.ReactNode}) {
  const stages = [
    ['shortages','Shortage',p.shortage_ref],['proposals','Proposal',p.proposal_code],
    ['approvals','Approval',p.rejected_by ? 'Rejected' : p.approved_by ? 'Approved' : p.submitted_at ? 'Awaiting review' : ''],
    ['orders','Purchase order',po?.po_number],['emails','Supplier email',email?.delivery_status],
  ] as const;
  return <div className="review-grid"><article className="purchase-document">
    <small>{p.proposal_code}　/　Revision {p.version}</small><h1>Review purchase proposal</h1>
    <ol className="doc-history">{stages.map(([icon,name,record]) => <li key={icon} data-record={Boolean(record)}><ProcurementIcon name={icon}/><strong>{name}</strong><small>{record || 'Pending'}</small></li>)}</ol>
    <dl className="invoice-parties"><dt>Supplier</dt><dd>{p.preferred_supplier.name}<small>{p.preferred_supplier.location}</small></dd><dt>Item</dt><dd>{p.sku_name}<small>{p.sku_code}</small></dd></dl>
    <table className="invoice"><thead><tr><th>Quantity</th><th>Unit price</th><th>Estimated total</th></tr></thead><tbody><tr><td>{p.recommended_quantity} <small>{p.unit}</small></td><td>{formatInr(p.estimated_unit_price)}</td><td>{formatInr(p.estimated_total_price)}</td></tr></tbody></table>
    <details className="purchase-context"><summary>Proposal rationale and supporting cases</summary><p>{p.ai_execution_mode} · AI suggestion</p><p>{p.ai_justification}</p><p>{p.risk_assessment}</p>{p.historical_case_refs.map(c => <p key={c.case_id}>{c.case_id} · {c.title} · {Math.round(c.similarity_score * 100)}% · {c.outcome_summary}</p>)}</details>
  </article><aside className="review-aside"><small>Decision evidence</small><h2>{p.plant_name}</h2>
    <InventoryEvidence key={p.plant_id + '/' + p.sku_id} plant={p.plant_id} sku={p.sku_id} unit={p.unit}/>
    <dl className="facts"><dt>Required quantity</dt><dd>{p.required_quantity} {p.unit}</dd><dt>Recorded availability</dt><dd>{p.available_quantity} {p.unit}</dd><dt>Shortage</dt><dd>{p.shortage_quantity} {p.unit}</dd></dl>

    {children}
    {p.approved_by && <p>Approved by {p.approved_by} · {p.approved_at}</p>}
    {p.rejected_by && <p>Rejected by {p.rejected_by} · {p.rejection_reason}</p>}
    {po && <p>{po.po_number} · {po.approval_reference}</p>}
  </aside></div>;
}
