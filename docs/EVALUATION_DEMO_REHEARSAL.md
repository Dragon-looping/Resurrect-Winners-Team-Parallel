# SETUVYUHA PS3 Evaluation & Judge Demo Rehearsal Guide

## 1. Quick Start Commands

```bash
# From repository root
cd apps/web
npm install   # If not already installed
npm run dev   # Starts Vite development server at http://localhost:5173
```

---

## 2. Authoritative Routes

| View | Route / URL | Description |
|---|---|---|
| **Judge Walkthrough** | `http://localhost:5173/#/evaluation` (Top Panel) | 5-step script with live screen jumps and status tags |
| **PS3 User Study** | `http://localhost:5173/#/evaluation` (Study Canvas) | Within-subjects trial protocol & Latin-square alternator |
| **Customer Portal** | `http://localhost:5173/#/customer/orders/ORD-2026-MANIPAL-50` | Split offer, negotiation, and "Insist on Friday" choice |
| **Request Intake** | `http://localhost:5173/#/customer/request` | SKU-driven order creation with catalog lookup |
| **Planner Workspace** | `http://localhost:5173/#/planner/orders/ORD-2026-MANIPAL-50` | Godown route map, truck cutoff challenge, P4 case steering, and purchasing review |

---

## 3. Exact Reset Steps

### Method A: Browser UI (One-Click)
- **Evaluation Study**: Click **"Reset All Evaluation Data"** in the top-right of the PS3 Evaluation page.
- **Planner Workspace**: Click **"Reset Fixtures"** in the top-right of the Planner page.
- **Customer Portal**: Click **"Reset Fixtures"** in the top-right of the Request Intake / Order Portal header.

### Method B: Browser Console
```javascript
// Reset Customer Portal fixture scenarios
import { resetFixtureData } from '/src/customer/adapters/orderAdapter.ts';
resetFixtureData();

// Reset Planner Workspace orders & telemetry
import { resetPlannerFixtures } from '/src/planner/adapters/plannerAdapter.ts';
resetPlannerFixtures();

// Reset PS3 Empirical Study participant submissions
import { resetEvaluationStore } from '/src/evaluation/adapters/evaluationAdapter.ts';
resetEvaluationStore();

location.reload();
```

---

## 4. Rehearsal Demonstration Checklist

### Scenario A: Customer Portal Negotiation
1. Open `http://localhost:5173/#/customer/orders/ORD-2026-MANIPAL-50`.
2. Inspect the proposed split card: **"40 of 50 units offered"** (40 Fri + 10 Sun).
3. Click **"Insist on Original Terms"**.
4. Confirm status changes to **"Recovery Pending"** with customer note and Friday promise preserved.

### Scenario B: Planner Cutoff Challenge
1. Open `http://localhost:5173/#/planner/orders/ORD-2026-MANIPAL-50`.
2. Select **"Safe Inter-Order Swap (Mangalore Buffer → Manipal)"**.
3. **Safe cutoff test**: Type `16:30` → Click "Simulate Impact" → Green feasible banner.
4. **Unsafe cutoff test**: Type `14:30` → Click "Simulate Impact" → Red infeasible banner explaining both Manipal delay and Kundapura donor failure.
5. In Recovery Approval card, verify "Approve Recovery" button is **blocked**.
6. Set cutoff back to `16:30` → Enter approver name → Click **"Approve Recovery"** → Status turns **Resolved**.

### Scenario C: P4 Historical Case Steering
1. Scroll down to **Historical Case Panel**.
2. Drag query steering slider from `0%` to `100%`.
3. Observe 2D SVG plot dynamically reposition and recolor points according to interpolated similarity scores.
4. Click point `CASE-2025-089` to view evidence citation `LOG-2025-089-EV` and tabbed role briefings.

### Scenario D: Purchasing Review & Receipts
1. Scroll down to **Purchasing Review**.
2. Click **"Create Purchase Order…"** → Confirm modal → Receipt displays PO `#PO-2026-8841-A`.
3. Click **"Send Supplier Email…"** → Confirm modal → Receipt displays Message `#MSG-SUPP-8841`.

### Scenario E: PS3 User Study Protocol
1. Open `http://localhost:5173/#/evaluation`.
2. Enter Participant ID `P-01` → Click "Begin Evaluation Session".
3. Group A is assigned: Trial 1 = Interactive Map, Trial 2 = Text Baseline.
4. Start Trial 1 → Complete decision → Post-Trial dialog opens → Rate perceived control (1–5) → Submit.
5. Study summary table updates automatically with latency and accuracy metrics.

---

## 5. Live vs Fixture Dependency Status

- **P1 Inventory Events (`/inventory/events`)**: `[LIVE-VERIFIED]` in backend integration test suite.
- **P2 Fulfilment Lifecycle & Cutoff API**: `[FIXTURE-VERIFIED]` in frontend adapter; endpoints `POST /fulfilment/orders/{id}/reply` and `POST /planner/orders/{id}/cutoff-preview` pending backend merge.
- **P4 Case Steering (`/cases/steer`)**: `[FIXTURE-VERIFIED]` using fixed 2D embedding coordinates and linear similarity interpolation.
