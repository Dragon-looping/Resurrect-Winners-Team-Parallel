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

const API_BASE = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export interface ActorCredentials {
  actorId: string;
  actorRole: ProcurementRole;
}

async function requestJson<T>(
  path: string,
  actor: ActorCredentials,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Actor-Id': actor.actorId,
      'X-Actor-Role': actor.actorRole,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body && typeof body.detail === 'string') {
        detail = body.detail;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export const procurementAdapter = {
  getDashboard(actor: ActorCredentials): Promise<ProcurementDashboard> {
    return requestJson<ProcurementDashboard>('/procurement/dashboard', actor);
  },

  getShortages(actor: ActorCredentials): Promise<ShortageAlert[]> {
    return requestJson<ShortageAlert[]>('/procurement/shortages', actor);
  },

  generateProposal(
    actor: ActorCredentials,
    shortageRef: string,
    deliveryNotes?: string
  ): Promise<PurchaseProposal> {
    return requestJson<PurchaseProposal>('/procurement/proposals/generate', actor, {
      method: 'POST',
      body: JSON.stringify({
        shortage_ref: shortageRef,
        delivery_notes: deliveryNotes || null,
      }),
    });
  },

  getProposals(actor: ActorCredentials): Promise<PurchaseProposal[]> {
    return requestJson<PurchaseProposal[]>('/procurement/proposals', actor);
  },

  submitProposal(
    actor: ActorCredentials,
    proposalId: number,
    expectedVersion: number,
    notes?: string
  ): Promise<PurchaseProposal> {
    return requestJson<PurchaseProposal>(`/procurement/proposals/${proposalId}/submit`, actor, {
      method: 'POST',
      body: JSON.stringify({ expected_version: expectedVersion, notes: notes || null }),
    });
  },

  getApprovalQueue(actor: ActorCredentials): Promise<PurchaseProposal[]> {
    return requestJson<PurchaseProposal[]>('/procurement/approvals/queue', actor);
  },

  approveProposal(
    actor: ActorCredentials,
    proposalId: number,
    expectedVersion: number,
    approvalNotes?: string
  ): Promise<PurchaseProposal> {
    return requestJson<PurchaseProposal>(`/procurement/proposals/${proposalId}/approve`, actor, {
      method: 'POST',
      body: JSON.stringify({
        expected_version: expectedVersion,
        approval_notes: approvalNotes || null,
      }),
    });
  },

  rejectProposal(
    actor: ActorCredentials,
    proposalId: number,
    expectedVersion: number,
    reason: string
  ): Promise<PurchaseProposal> {
    return requestJson<PurchaseProposal>(`/procurement/proposals/${proposalId}/reject`, actor, {
      method: 'POST',
      body: JSON.stringify({ expected_version: expectedVersion, reason }),
    });
  },

  getProposalHistory(actor: ActorCredentials, proposalId: number): Promise<AuditLogEntry[]> {
    return requestJson<AuditLogEntry[]>(`/procurement/proposals/${proposalId}/history`, actor);
  },

  createPurchaseOrder(
    actor: ActorCredentials,
    proposalId: number,
    deliveryNotes?: string
  ): Promise<PurchaseOrder> {
    return requestJson<PurchaseOrder>('/procurement/purchase-orders', actor, {
      method: 'POST',
      body: JSON.stringify({
        proposal_id: proposalId,
        delivery_notes: deliveryNotes || null,
      }),
    });
  },

  getPurchaseOrders(actor: ActorCredentials): Promise<PurchaseOrder[]> {
    return requestJson<PurchaseOrder[]>('/procurement/purchase-orders', actor);
  },

  updatePurchaseOrderStatus(
    actor: ActorCredentials,
    poId: number,
    targetStatus: PurchaseOrderStatus,
    expectedVersion: number,
    notes?: string
  ): Promise<PurchaseOrder> {
    return requestJson<PurchaseOrder>(`/procurement/purchase-orders/${poId}/status`, actor, {
      method: 'POST',
      body: JSON.stringify({
        target_status: targetStatus,
        expected_version: expectedVersion,
        notes: notes || null,
      }),
    });
  },

  previewSupplierEmail(
    actor: ActorCredentials,
    poId: number,
    customNote?: string
  ): Promise<EmailPreview> {
    const query = customNote ? `?custom_note=${encodeURIComponent(customNote)}` : '';
    return requestJson<EmailPreview>(
      `/procurement/purchase-orders/${poId}/email/preview${query}`,
      actor,
      { method: 'POST' }
    );
  },

  sendSupplierEmail(
    actor: ActorCredentials,
    poId: number,
    humanConfirmed: boolean,
    customNote?: string
  ): Promise<EmailLog> {
    return requestJson<EmailLog>(`/procurement/purchase-orders/${poId}/email/send`, actor, {
      method: 'POST',
      body: JSON.stringify({
        human_confirmed: humanConfirmed,
        custom_note: customNote || null,
      }),
    });
  },

  getEmailLogs(actor: ActorCredentials): Promise<EmailLog[]> {
    return requestJson<EmailLog[]>('/procurement/email-logs', actor);
  },

  getAuditLogs(actor: ActorCredentials): Promise<AuditLogEntry[]> {
    return requestJson<AuditLogEntry[]>('/procurement/audit-logs?limit=50', actor);
  },

  generateBriefing(
    actor: ActorCredentials,
    targetRole: ProcurementRole
  ): Promise<OperationalBriefing> {
    return requestJson<OperationalBriefing>('/procurement/briefings', actor, {
      method: 'POST',
      body: JSON.stringify({ target_role: targetRole }),
    });
  },
};
