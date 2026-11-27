export type ProcurementRole =
  | 'WAREHOUSE_MANAGER'
  | 'PROCUREMENT_OFFICER'
  | 'ADMINISTRATOR'
  | 'PLANNER'
  | 'CUSTOMER'
  | 'AI_SYSTEM';

export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ProposalStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ORDER_CREATED';

export type PurchaseOrderStatus =
  | 'CREATED'
  | 'READY_TO_SEND'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'FULFILLED'
  | 'CANCELLED';

export type EmailDeliveryStatus =
  | 'PREVIEWED'
  | 'CONFIRMED_PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SIMULATED_UNCONFIGURED';

export interface SupplierOption {
  supplier_id: number;
  supplier_code: string;
  name: string;
  contact_name: string;
  contact_email: string;
  phone: string;
  location: string;
  unit_price_inr: number;
  min_order_qty: number;
  lead_time_days: number;
  reliability_score: number;
  is_preferred: boolean;
}

export interface ShortageAlert {
  shortage_ref: string;
  order_id: number;
  order_number: string;
  customer_name: string;
  plant_id: number;
  plant_name: string;
  plant_location: string;
  sku_id: number;
  sku_code: string;
  sku_name: string;
  unit: string;
  agreed_delivery_date: string;
  required_quantity: number;
  available_quantity: number;
  shortage_quantity: number;
  urgency_level: UrgencyLevel;
  severity_score: number;
  risk_classification: string;
  feed_is_stale: boolean;
  affected_departments: string[];
  has_active_proposal: boolean;
  active_proposal_id: number | null;
  active_proposal_code: string | null;
}

export interface HistoricalCaseRef {
  case_id: string;
  title: string;
  similarity_score: number;
  resolution_type: string;
  outcome_summary: string;
}

export interface PurchaseProposal {
  id: number;
  proposal_code: string;
  shortage_ref: string;
  order_id: number | null;
  plant_id: number;
  plant_name: string;
  sku_id: number;
  sku_code: string;
  sku_name: string;
  unit: string;
  required_quantity: number;
  available_quantity: number;
  shortage_quantity: number;
  recommended_quantity: number;
  estimated_unit_price: number;
  estimated_total_price: number;
  currency: string;
  preferred_supplier: SupplierOption;
  alternative_suppliers: SupplierOption[];
  delivery_requirements: Record<string, unknown>;
  urgency_level: UrgencyLevel;
  affected_departments: string[];
  ai_justification: string;
  risk_assessment: string;
  historical_case_refs: HistoricalCaseRef[];
  ai_execution_mode: string;
  ai_grounding_notes: Record<string, unknown>;
  status: ProposalStatus;
  version: number;
  created_by: string;
  submitted_by?: string | null;
  submitted_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  proposal_id: number;
  proposal_code: string;
  supplier_id: number;
  supplier_code: string;
  supplier_name: string;
  supplier_email: string;
  plant_id: number;
  plant_name: string;
  sku_id: number;
  sku_code: string;
  sku_name: string;
  unit: string;
  approved_quantity: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  delivery_info: Record<string, unknown>;
  approval_reference: string;
  approved_by: string;
  status: PurchaseOrderStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface EmailPreview {
  purchase_order_id: number;
  po_number: string;
  recipient_name: string;
  recipient_email: string;
  subject: string;
  body_text: string;
  body_html: string;
  integration_status: string;
  smtp_host_configured: boolean;
  requires_human_confirmation: boolean;
  previewed_at: string;
}

export interface EmailLog {
  id: number;
  purchase_order_id: number;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body_text: string;
  integration_status: string;
  delivery_status: EmailDeliveryStatus;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  sent_at?: string | null;
  error_message?: string | null;
  provider_message_id?: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string;
  actor_role: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface BriefingIssue {
  priority: number;
  severity: string;
  title: string;
  detail: string;
  evidence_ref: string;
}

export interface OperationalBriefing {
  role: ProcurementRole;
  generated_at: string;
  executive_summary: string;
  critical_observations: string[];
  priority_ranked_issues: BriefingIssue[];
  supporting_evidence: Array<Record<string, unknown>>;
  recommended_actions: string[];
  metrics_snapshot: Record<string, unknown>;
  ai_execution_mode: string;
  fallback_used: boolean;
}

export interface ProcurementDashboard {
  active_shortages_count: number;
  critical_shortages_count: number;
  proposals_by_status: Record<string, number>;
  purchase_orders_by_status: Record<string, number>;
  total_approved_exposure_inr: number;
  pending_approval_exposure_inr: number;
  emails_sent_count: number;
  email_integration_configured: boolean;
}
