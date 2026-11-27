import { getAdapterConfig } from '../customer/adapters/orderAdapter.ts';

export interface HistoricalCaseRecord {
  case_id: string;
  title: string;
  description: string;
  sku: string;
  category: string;
  origin_hub: string;
  destination_hub: string;
  quantity: number;
  resolution_type: string;
  outcome_summary: string;
  tags: string[];
}

export interface CaseProjectionPoint {
  case_id: string;
  x: number;
  y: number;
  label: string;
  category: string;
  resolution_type: string;
  is_query?: boolean;
  is_steered_query?: boolean;
}

export interface CaseSearchHit {
  case: HistoricalCaseRecord;
  similarity_score: number;
  base_similarity_score: number;
  rank: number;
  base_rank: number;
  rank_delta: number;
  projection?: CaseProjectionPoint | null;
}

export interface CaseSearchResponse {
  query: string;
  total_matches: number;
  offset: number;
  top_k: number;
  embedding_dimension: number;
  steering_applied: boolean;
  steering_strength: number;
  steering_direction_label?: string | null;
  results: CaseSearchHit[];
  projection_points: CaseProjectionPoint[];
  warnings: string[];
}

export interface ClarificationQuestion {
  question_id: string;
  field: string;
  priority: number;
  question_text: string;
  reason: string;
  options: Array<{ id: string; label: string; description?: string; is_safe_default?: boolean }>;
  suggested_default?: string | null;
}

export interface SafeDefaultSuggestion {
  field: string;
  suggested_value: unknown;
  label: string;
  rationale: string;
  is_suggestion: true;
}

export interface ClarificationResponse {
  clarification_required: boolean;
  can_proceed: boolean;
  brief_explanation: string;
  missing_required_fields: string[];
  conflicts: Array<{ conflict_type: string; description: string; fields_involved: string[] }>;
  questions: ClarificationQuestion[];
  safe_defaults: SafeDefaultSuggestion[];
  extracted_context: Record<string, unknown>;
  confidence: number;
}

export interface SteeringPreset {
  id: string;
  label: string;
  description: string;
}

export const STEERING_PRESETS: SteeringPreset[] = [
  { id: 'split_delivery', label: 'Split Delivery Focus', description: 'Steer toward staged/split fulfilment cases with partial immediate dispatch.' },
  { id: 'single_load', label: 'Single-Load / Strict Terms', description: 'Steer toward consolidated single-shipment cases where all units travel together.' },
  { id: 'later_consolidation', label: 'Later Consolidation', description: 'Steer toward deferred single-delivery schedules avoiding split drops.' },
  { id: 'inter_hub_recovery', label: 'Emergency Inter-Hub Recovery', description: 'Steer toward cross-depot recovery scans and buffer transfers.' },
  { id: 'urgent_deadline', label: 'Urgent Deadline Priority', description: 'Steer toward time-critical dispatches and same-week fulfilment.' }
];

interface SeedCaseWithCoords {
  record: HistoricalCaseRecord;
  x: number;
  y: number;
  keywords: string[];
}

const LOCAL_SEEDED_CASES: SeedCaseWithCoords[] = [
  {
    record: {
      case_id: 'CASE-MANIPAL-FAN-SPLIT-01',
      title: 'Manipal 50 Industrial Fans — Udupi 40/10 Split Fulfilment',
      description: 'Urgent order for 50 FAN-HV-24-IND fans to Manipal; 40 delivered Friday from Udupi Central and 10 Sunday from Mangalore Depot.',
      sku: 'FAN-HV-24-IND',
      category: 'industrial_fans',
      origin_hub: 'Udupi Central Warehouse',
      destination_hub: 'Manipal Commercial Center',
      quantity: 50,
      resolution_type: 'split_delivery',
      outcome_summary: '40 delivered Friday, 10 delivered Sunday via Mangalore buffer.',
      tags: ['split_delivery', 'urgent', 'udupi', 'manipal', 'stock_shortage']
    },
    x: -0.62,
    y: 0.58,
    keywords: ['50', 'fan', 'fans', 'industrial', 'manipal', 'udupi', 'split', '40', '10', 'friday', 'urgent', 'mangalore']
  },
  {
    record: {
      case_id: 'CASE-MANIPAL-FAN-LATER-02',
      title: 'Manipal 50 Industrial Fans — Later Consolidated Single Delivery',
      description: 'Customer declined split delivery for 50 industrial fans and accepted consolidated Tuesday delivery from Udupi Central.',
      sku: 'FAN-HV-24-IND',
      category: 'industrial_fans',
      origin_hub: 'Udupi Central Warehouse',
      destination_hub: 'Manipal Commercial Center',
      quantity: 50,
      resolution_type: 'later_single_delivery',
      outcome_summary: 'All 50 fans delivered together on Tuesday in one manifest.',
      tags: ['single_load', 'later_consolidation', 'udupi', 'manipal']
    },
    x: 0.68,
    y: -0.24,
    keywords: ['50', 'fan', 'fans', 'industrial', 'manipal', 'udupi', 'later', 'tuesday', 'single', 'together', 'consolidated']
  },
  {
    record: {
      case_id: 'CASE-MANIPAL-FAN-RECOVERY-03',
      title: 'Manipal 50 Industrial Fans — Emergency Inter-Hub Recovery Scan',
      description: 'Customer insisted on Friday single-load deadline for 50 fans; emergency inter-hub recovery scan across Mangalore and Bengaluru.',
      sku: 'FAN-HV-24-IND',
      category: 'industrial_fans',
      origin_hub: 'Bengaluru Hub',
      destination_hub: 'Manipal Commercial Center',
      quantity: 50,
      resolution_type: 'inter_hub_recovery',
      outcome_summary: 'Emergency inter-hub transfer initiated; missing stock verified honestly.',
      tags: ['inter_hub_recovery', 'single_load', 'urgent', 'bengaluru']
    },
    x: -0.18,
    y: 0.44,
    keywords: ['50', 'fan', 'fans', 'manipal', 'bengaluru', 'recovery', 'inter-hub', 'scan', 'insist', 'single', 'urgent', 'friday']
  },
  {
    record: {
      case_id: 'CASE-UDUPI-CLARIFY-DATE-04',
      title: 'Manipal Exhibition — Arrival vs Warehouse Dispatch Ambiguity',
      description: 'Request for 50 fans by Friday without specifying arrival at Manipal dock vs warehouse dispatch from Udupi.',
      sku: 'FAN-HV-24-IND',
      category: 'industrial_fans',
      origin_hub: 'Udupi Central Warehouse',
      destination_hub: 'Manipal Commercial Center',
      quantity: 50,
      resolution_type: 'clarification_resolved',
      outcome_summary: 'Clarified arrival-by-date semantics before issuing binding split schedule.',
      tags: ['clarification', 'ambiguity', 'udupi', 'manipal']
    },
    x: 0.22,
    y: 0.48,
    keywords: ['50', 'fan', 'fans', 'manipal', 'udupi', 'friday', 'ambiguous', 'clarify', 'arrival', 'dispatch']
  },
  {
    record: {
      case_id: 'CASE-KUNDAPURA-PUMP-SPLIT-05',
      title: 'Kundapura 20 Submersible Pumps — Split Buffer Dispatch',
      description: 'Urgent irrigation order for 20 5HP submersible pumps; 15 staged at Mangalore Depot and 5 routed from Bengaluru buffer.',
      sku: 'PMP-SUB-05-AGR',
      category: 'agricultural_pumps',
      origin_hub: 'Mangalore Depot',
      destination_hub: 'Kundapura Agro Depot',
      quantity: 20,
      resolution_type: 'split_delivery',
      outcome_summary: '15 pumps delivered next day, 5 delivered 48 hours later via NH66.',
      tags: ['split_delivery', 'pumps', 'kundapura', 'mangalore', 'urgent']
    },
    x: -0.58,
    y: -0.28,
    keywords: ['20', 'pump', 'pumps', 'submersible', 'kundapura', 'mangalore', 'split', 'urgent', 'irrigation']
  },
  {
    record: {
      case_id: 'CASE-BRAHMAVAR-PUMP-STD-06',
      title: 'Brahmavar 12 Submersible Pumps — Standard Direct Fulfilment',
      description: 'Routine agricultural order for 12 submersible pumps to Brahmavar Farm Supply; direct truck dispatch from Mangalore Depot.',
      sku: 'PMP-SUB-05-AGR',
      category: 'agricultural_pumps',
      origin_hub: 'Mangalore Depot',
      destination_hub: 'Brahmavar Farm Supply',
      quantity: 12,
      resolution_type: 'standard_fulfilment',
      outcome_summary: 'All 12 pumps fulfilled directly with zero disruption.',
      tags: ['standard', 'pumps', 'brahmavar', 'mangalore']
    },
    x: 0.14,
    y: -0.52,
    keywords: ['12', 'pump', 'pumps', 'submersible', 'brahmavar', 'mangalore', 'standard', 'direct']
  },
  {
    record: {
      case_id: 'CASE-MANGALORE-FAN-BULK-07',
      title: 'Mangalore Port Warehouse 100 Industrial Fans — Later Consolidated',
      description: 'Bulk order of 100 industrial fans for Mangalore port with strict single-load dock constraint; consolidated at Bengaluru Hub.',
      sku: 'FAN-HV-24-IND',
      category: 'industrial_fans',
      origin_hub: 'Bengaluru Hub',
      destination_hub: 'Mangalore Port Terminal',
      quantity: 100,
      resolution_type: 'later_single_delivery',
      outcome_summary: 'Consolidated 100-unit single load delivered within 4-day window.',
      tags: ['bulk', 'single_load', 'later_consolidation', 'bengaluru', 'mangalore']
    },
    x: 0.74,
    y: -0.56,
    keywords: ['100', 'bulk', 'fan', 'fans', 'mangalore', 'bengaluru', 'single', 'later', 'consolidated']
  },
  {
    record: {
      case_id: 'CASE-UDUPI-FAN-RECOVERY-08',
      title: 'Udupi Hospital Wing 30 Fans — Urgent Inter-Hub Transfer',
      description: 'Urgent ventilation requirement for 30 fans at Udupi clinic; emergency reserve pulled from Mangalore Depot via NH66.',
      sku: 'FAN-HV-24-IND',
      category: 'industrial_fans',
      origin_hub: 'Mangalore Depot',
      destination_hub: 'Udupi Central Warehouse',
      quantity: 30,
      resolution_type: 'inter_hub_recovery',
      outcome_summary: 'Same-day coastal transfer from Mangalore Depot fulfilled urgent demand.',
      tags: ['inter_hub_recovery', 'urgent', 'coastal', 'udupi', 'mangalore']
    },
    x: -0.34,
    y: 0.36,
    keywords: ['30', 'fan', 'fans', 'udupi', 'mangalore', 'urgent', 'recovery', 'inter-hub', 'transfer']
  },
  {
    record: {
      case_id: 'CASE-BENGALURU-PUMP-SPLIT-09',
      title: 'Bengaluru Peri-Urban 60 Submersible Pumps — Two-Wave Split',
      description: 'Large estate order of 60 agricultural submersible pumps; 40 dispatched immediately and 20 staged in second wave.',
      sku: 'PMP-SUB-05-AGR',
      category: 'agricultural_pumps',
      origin_hub: 'Bengaluru Hub',
      destination_hub: 'Bengaluru East Estate',
      quantity: 60,
      resolution_type: 'split_delivery',
      outcome_summary: 'Two-wave split reduced idle crew time while preserving 60-unit allocation.',
      tags: ['split_delivery', 'bulk', 'pumps', 'bengaluru']
    },
    x: -0.46,
    y: -0.62,
    keywords: ['60', 'pump', 'pumps', 'bengaluru', 'split', '40', '20', 'bulk']
  },
  {
    record: {
      case_id: 'CASE-MANIPAL-PUMP-CLARIFY-10',
      title: 'Manipal Campus 15 Pumps — Missing Voltage & Single-Load Clarification',
      description: 'Ambiguous campus request for 15 pumps without SKU specification; clarification confirmed PMP-SUB-05-AGR and split tolerance.',
      sku: 'PMP-SUB-05-AGR',
      category: 'agricultural_pumps',
      origin_hub: 'Udupi Central Warehouse',
      destination_hub: 'Manipal Campus',
      quantity: 15,
      resolution_type: 'clarification_resolved',
      outcome_summary: 'Resolved SKU ambiguity and confirmed split-tolerant delivery window.',
      tags: ['clarification', 'pumps', 'manipal', 'small_batch']
    },
    x: 0.08,
    y: 0.14,
    keywords: ['15', 'pump', 'pumps', 'manipal', 'udupi', 'clarify', 'ambiguous', 'split']
  }
];

const PRESET_OFFSETS: Record<string, { dx: number; dy: number; tags: string[] }> = {
  split_delivery: { dx: -0.55, dy: 0.2, tags: ['split_delivery'] },
  single_load: { dx: 0.6, dy: 0.05, tags: ['single_load'] },
  later_consolidation: { dx: 0.55, dy: -0.4, tags: ['later_consolidation'] },
  inter_hub_recovery: { dx: -0.25, dy: 0.35, tags: ['inter_hub_recovery'] },
  urgent_deadline: { dx: -0.2, dy: 0.55, tags: ['urgent'] }
};

function computeLocalSearch(
  query: string,
  steeringDirection: string,
  steeringStrength: number,
  topK: number
): CaseSearchResponse {
  const tokens = query.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
  const preset = PRESET_OFFSETS[steeringDirection] ?? PRESET_OFFSETS.split_delivery;
  const steeringApplied = Math.abs(steeringStrength) > 1e-6;

  // Base query 2D position derived deterministically from matched cases
  let qx = 0;
  let qy = 0;
  let weightSum = 0;

  const scored = LOCAL_SEEDED_CASES.map((item) => {
    const overlap = tokens.reduce((acc, tok) => {
      if (item.keywords.includes(tok) || item.record.description.toLowerCase().includes(tok)) {
        return acc + 1;
      }
      return acc;
    }, 0);
    const baseScore = tokens.length === 0 ? 0 : Math.min(0.98, Number((0.18 + overlap * 0.14).toFixed(4)));
    qx += item.x * baseScore;
    qy += item.y * baseScore;
    weightSum += baseScore;

    const tagMatch = item.record.tags.some((t) => preset.tags.includes(t)) ? 1 : -0.35;
    const steeredScore = steeringApplied
      ? Math.max(-1, Math.min(1, Number((baseScore + steeringStrength * 0.24 * tagMatch).toFixed(4))))
      : baseScore;

    return { item, baseScore, steeredScore };
  });

  if (weightSum > 0) {
    qx = Number((qx / weightSum).toFixed(4));
    qy = Number((qy / weightSum).toFixed(4));
  }

  const steeredQx = Number((qx + steeringStrength * 0.42 * preset.dx).toFixed(4));
  const steeredQy = Number((qy + steeringStrength * 0.42 * preset.dy).toFixed(4));

  const baseSorted = [...scored].sort((a, b) => b.baseScore - a.baseScore || a.item.record.case_id.localeCompare(b.item.record.case_id));
  const baseRankMap = new Map(baseSorted.map((s, idx) => [s.item.record.case_id, idx + 1]));

  const steeredSorted = [...scored].sort((a, b) => b.steeredScore - a.steeredScore || a.item.record.case_id.localeCompare(b.item.record.case_id));
  const results: CaseSearchHit[] = steeredSorted.slice(0, topK).map((s, idx) => {
    const rank = idx + 1;
    const baseRank = baseRankMap.get(s.item.record.case_id) ?? rank;
    return {
      case: s.item.record,
      similarity_score: s.steeredScore,
      base_similarity_score: s.baseScore,
      rank,
      base_rank: baseRank,
      rank_delta: baseRank - rank,
      projection: {
        case_id: s.item.record.case_id,
        x: s.item.x,
        y: s.item.y,
        label: s.item.record.title,
        category: s.item.record.category,
        resolution_type: s.item.record.resolution_type
      }
    };
  });

  const projectionPoints: CaseProjectionPoint[] = [
    ...LOCAL_SEEDED_CASES.map((s) => ({
      case_id: s.record.case_id,
      x: s.x,
      y: s.y,
      label: s.record.title,
      category: s.record.category,
      resolution_type: s.record.resolution_type
    })),
    {
      case_id: 'QUERY_BASE',
      x: qx,
      y: qy,
      label: 'Query (Unsteered)',
      category: 'query',
      resolution_type: 'query',
      is_query: true,
      is_steered_query: false
    }
  ];

  if (steeringApplied) {
    projectionPoints.push({
      case_id: 'QUERY_STEERED',
      x: steeredQx,
      y: steeredQy,
      label: `Query (Steered ${steeringStrength >= 0 ? '+' : ''}${steeringStrength.toFixed(2)})`,
      category: 'query',
      resolution_type: 'query',
      is_query: true,
      is_steered_query: true
    });
  }

  return {
    query,
    total_matches: LOCAL_SEEDED_CASES.length,
    offset: 0,
    top_k: topK,
    embedding_dimension: 64,
    steering_applied: steeringApplied,
    steering_strength: steeringStrength,
    steering_direction_label: STEERING_PRESETS.find((p) => p.id === steeringDirection)?.label ?? steeringDirection,
    results,
    projection_points: projectionPoints,
    warnings: tokens.length === 0 ? ['Empty query; enter keywords to rank cases.'] : []
  };
}

export async function searchCasesWithSteering(params: {
  query: string;
  steeringDirection: string;
  steeringStrength: number;
  topK?: number;
}): Promise<CaseSearchResponse> {
  const cfg = getAdapterConfig();
  const topK = params.topK ?? 6;
  if (cfg.mode === 'live') {
    const res = await fetch(`${cfg.apiBaseUrl}/cases/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query,
        top_k: topK,
        steering_direction: params.steeringDirection,
        steering_strength: params.steeringStrength,
        include_projection: true
      })
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`POST /cases/search failed (${res.status}): ${errBody || res.statusText}`);
    }
    return res.json();
  }
  return computeLocalSearch(params.query, params.steeringDirection, params.steeringStrength, topK);
}

export async function analyzeClarification(requestText: string): Promise<ClarificationResponse> {
  const cfg = getAdapterConfig();
  if (cfg.mode === 'live') {
    const res = await fetch(`${cfg.apiBaseUrl}/clarify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_text: requestText })
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`POST /clarify failed (${res.status}): ${errBody || res.statusText}`);
    }
    return res.json();
  }

  // Deterministic local mirror for offline demonstration
  const lower = requestText.toLowerCase();
  const hasProduct = /(fan|pump|cable|pipe|motor|generator)/i.test(lower);
  const hasQty = /\b\d+\b/.test(lower);
  const hasDest = /(manipal|udupi|mangalore|bengaluru|bangalore|kundapura|brahmavar)/i.test(lower);
  const hasDate = /(20\d{2}-\d{2}-\d{2}|today|tomorrow|friday|monday|tuesday|wednesday|thursday|urgent|asap)/i.test(lower);
  const conflictSplitSingle = /(all together|single load|no split)/i.test(lower) && /(split ok|split delivery ok|split fine)/i.test(lower);

  const missing: string[] = [];
  if (!hasProduct) missing.push('product_or_sku');
  if (!hasQty) missing.push('quantity');
  if (!hasDest) missing.push('destination');
  if (!hasDate) missing.push('requested_date');

  const questions: ClarificationQuestion[] = [];
  if (conflictSplitSingle) {
    questions.push({
      question_id: 'Q-CONFLICT-DELIVERY-MODE',
      field: 'must_arrive_together',
      priority: 1,
      question_text: 'Your request mentions both single-load and split delivery. Which fulfilment rule should apply?',
      reason: 'Conflicting delivery mode requirements.',
      options: [
        { id: 'allow_split', label: 'Allow split delivery if primary hub has partial stock', is_safe_default: true },
        { id: 'strict_single', label: 'Require single consolidated delivery only' }
      ],
      suggested_default: 'allow_split'
    });
  }
  if (!hasProduct) {
    questions.push({
      question_id: 'Q-MISSING-PRODUCT',
      field: 'product_or_sku',
      priority: questions.length + 1,
      question_text: 'Which product or SKU should be fulfilled (e.g., FAN-HV-24-IND fans or PMP-SUB-05-AGR pumps)?',
      reason: 'Missing product specification.',
      options: []
    });
  }
  if (!hasQty) {
    questions.push({
      question_id: 'Q-MISSING-QUANTITY',
      field: 'quantity',
      priority: questions.length + 1,
      question_text: 'How many units are required?',
      reason: 'Missing quantity.',
      options: []
    });
  }
  if (!hasDest) {
    questions.push({
      question_id: 'Q-MISSING-DESTINATION',
      field: 'destination',
      priority: questions.length + 1,
      question_text: 'Where should the shipment be delivered?',
      reason: 'Missing destination.',
      options: []
    });
  }
  if (!hasDate) {
    questions.push({
      question_id: 'Q-MISSING-DATE',
      field: 'requested_date',
      priority: questions.length + 1,
      question_text: 'What is the target delivery date or timeframe?',
      reason: 'Missing target timeframe.',
      options: []
    });
  }

  const clarificationRequired = missing.length > 0 || conflictSplitSingle;
  return {
    clarification_required: clarificationRequired,
    can_proceed: !clarificationRequired,
    brief_explanation: clarificationRequired
      ? `Clarification required: ${missing.length > 0 ? `missing essential field(s): ${missing.join(', ')}` : 'conflicting requirements detected'}.`
      : 'All essential fulfilment details are clear and consistent. Ready to proceed.',
    missing_required_fields: missing,
    conflicts: conflictSplitSingle
      ? [{ conflict_type: 'delivery_mode_conflict', description: 'Single-load and split-delivery both requested.', fields_involved: ['must_arrive_together'] }]
      : [],
    questions: questions.slice(0, 4),
    safe_defaults: !hasDate
      ? [{ field: 'requested_date', suggested_value: 'standard_48h_window', label: 'Standard 48-hour regional window (Suggestion)', rationale: 'Suggested only if no hard event deadline applies.', is_suggestion: true }]
      : [],
    extracted_context: { hasProduct, hasQty, hasDest, hasDate },
    confidence: clarificationRequired ? 0.55 : 0.96
  };
}
