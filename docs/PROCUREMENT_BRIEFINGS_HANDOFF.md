# SETUVYUHA — Branch 3: Procurement & Briefings Handoff

## Overview

Branch 3 (`feat/procurement-briefings`) connects SETUVYUHA's existing shortage detection (`app/fulfilment/risk.py`), Branch 1 AI Gateway (`app/ai/`), and Branch 2 Case Steering (`app/cases/`) into an end-to-end human-in-the-loop procurement, purchase order, supplier communication, and role-specific operational briefing system.

## Workflow

```
Shortage Detection (assess_backlog_and_risk)
  → AI Purchase Proposal (Branch 1 AI Gateway + Branch 2 Case Steering + verified supplier catalog)
  → Human Review & Approval (PROCUREMENT_OFFICER / ADMINISTRATOR only; AI blocked)
  → Purchase Order Generation (1:1 unique PO per approved proposal, transaction-safe)
  → Supplier Email Workflow (preview, integration check, explicit human confirmation)
  → Role-Specific AI Briefings (WAREHOUSE_MANAGER, PROCUREMENT_OFFICER, ADMINISTRATOR)
```

## Database Changes

Migration: `services/api/alembic/versions/0006_add_procurement_tables.py` (revises `0005_add_godown_recovery_tables`):
- `suppliers`: verified supplier master records and contact emails
- `supplier_catalog_items`: verified SKU pricing, MOQ, and lead times
- `purchase_proposals`: AI-assisted proposals with optimistic locking `version`, `shortage_ref`, and `ai_grounding_notes`
- `purchase_orders`: formal POs with `UniqueConstraint("proposal_id")` preventing duplicate POs
- `supplier_email_logs`: previews, confirmations, and SMTP delivery attempts
- `procurement_audit_logs`: immutable audit trail for proposals, approvals, POs, emails, and briefings

## API Endpoints (`/procurement` and `/api/procurement`)

- `GET /procurement/dashboard` — aggregate procurement KPIs
- `GET /procurement/shortages` — live shortage alerts from `assess_backlog_and_risk`
- `POST /procurement/proposals/generate` — generate AI-assisted proposal (duplicate active proposals blocked with 409)
- `GET /procurement/proposals`, `GET /procurement/proposals/{id}`
- `POST /procurement/proposals/{id}/submit`, `POST /procurement/proposals/{id}/cancel`
- `GET /procurement/approvals/queue`
- `POST /procurement/proposals/{id}/approve`, `POST /procurement/proposals/{id}/reject` (mandatory reason)
- `GET /procurement/proposals/{id}/history`
- `POST /procurement/purchase-orders`, `GET /procurement/purchase-orders`, `GET /procurement/purchase-orders/{id}`
- `POST /procurement/purchase-orders/{id}/status`
- `POST /procurement/purchase-orders/{id}/email/preview`
- `POST /procurement/purchase-orders/{id}/email/send` (requires `human_confirmed=true`)
- `GET /procurement/email-logs`, `GET /procurement/audit-logs`
- `POST /procurement/briefings`

## Email Integration Configuration

Optional environment variables for live SMTP dispatch:
- `SMTP_HOST`
- `SMTP_PORT` (default `587`)
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_USE_TLS` (default `true`)

When `SMTP_HOST` or `SMTP_FROM_EMAIL` is unset, email previews still work with `.eml` download and clipboard copy, while dispatch attempts honestly record `SIMULATED_UNCONFIGURED` without pretending an email was sent.

## Test Coverage

- **9 procurement-specific tests** covering:
  - Shortage integration and enriched alerts
  - AI proposal generation with Branch 1 + Branch 2 integration
  - Duplicate active proposal prevention (409 Conflict)
  - Proposal lifecycle (DRAFT → PENDING_APPROVAL → APPROVED/REJECTED)
  - Human-only approval enforcement (AI_SYSTEM, WAREHOUSE_MANAGER, CUSTOMER blocked)
  - Rejection with mandatory reason and full audit trail
  - Race condition prevention with optimistic version locking
  - Purchase Order generation and lifecycle state machine (CREATED → READY_TO_SEND → SENT → ACKNOWLEDGED → FULFILLED)
  - Email preview without SMTP, unconfirmed send blocked, SIMULATED_UNCONFIGURED honest status
  - Configured SMTP success/failure recording
  - Role-specific briefing permissions and grounded metrics
- **Full regression: 132/132 passed** (123 baseline + 9 procurement, 0 failures)
- P3 Customer Portal completely untouched (zero diff on `apps/web/src/customer/`)

## Frontend Integration

- `apps/web/src/procurement/pages/ProcurementPage.tsx` (7-tab workspace: Dashboard, Shortages, Proposals, Approval Center, Purchase Orders, Supplier Email, AI Briefings)
- Mounted at `/procurement` in `apps/web/src/App.tsx` and `apps/web/src/shared/Layout.tsx`.
- P3 Customer Portal (`apps/web/src/customer/`) is completely preserved and untouched.

## Known Limitations

- Node.js is not available in this environment — TypeScript type checks and production builds were not executed.
- SMTP is not configured — email dispatch records `SIMULATED_UNCONFIGURED` status (by design).
- Alembic migration `0006` exists but was not run against a live database; test suite uses `create_all()`.
