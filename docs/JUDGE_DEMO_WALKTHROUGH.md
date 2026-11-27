# SETUVYUHA Judge Demo Walkthrough (Person 3 — Frontend & Product Design)

A complete 5-step judge walkthrough demonstrating real-time inventory disruption, customer negotiation, non-mutating cutoff simulation, P4 case steering, and purchasing execution.

---

## Story Overview
> A retail shop in Manipal requests **50 industrial fans** by Friday 17:00 for an exhibition. Udupi warehouse physical inventory reconciliation corrects the count from **50 down to 40**. The system offers a split delivery (40 on Friday + 10 on Sunday). The customer insists on all 50 units together by Friday. The control tower planner executes an inter-order swap, tests dispatch cutoffs, examines historical evidence, and triggers purchasing.

---

## 5-Step Demo Script & Status Checklist

### Step 1: Warehouse Physical Count Correction (50 → 40 Fans)
- **Action**: Warehouse manager at Udupi depot scans bin and corrects recorded stock from 50 to 40 fans (`FAN-HV-24-IND`).
- **Telemetry**: Stock-out risk rises to 78%, backlog increases to 10 units. Stale feed alert triggers (`Udupi bin-audit telemetry is 22 min old`).
- **Where to see**:
  - Customer Portal: `http://localhost:5173/#/customer/orders/ORD-2026-MANIPAL-50`
  - Planner Tower: `http://localhost:5173/#/planner/orders/ORD-2026-MANIPAL-50`
- **Verification Status**:
  - `[FIXTURE-VERIFIED]`: Seeded scenario `ORD-2026-MANIPAL-50` in `scenarios.ts` & `plannerData.ts`.
  - `[LIVE-VERIFIED]`: `POST /inventory/events` (P1 inventory engine physical count adjustment).

---

### Step 2: Customer Portal Offer & "Insist on Friday" Negotiation
- **Action**:
  1. Open Customer Portal at `#customer/orders/ORD-2026-MANIPAL-50`.
  2. Inspect the proposed split offer card: **"40 of 50 units offered"** arriving Friday Nov 27 + **10 units** arriving Sunday Nov 29.
  3. Click **"Insist on Original Terms"** ("Must have all 50 by Friday").
  4. The screen updates to **"Recovery Pending"** state with original Friday promise preserved.
- **Verification Status**:
  - `[FIXTURE-VERIFIED]`: Validated in automated test `TC-04` and `evaluation_customer_choices.test.ts`.
  - `[LIVE-VERIFIED]`: Supported by `orderAdapter.ts` live bridge `POST /fulfilment/orders/{id}/reply`.
  - `[PENDING]`: P2 live fulfillment backend deployment.

---

### Step 3: Planner Godown Route Map & Truck Cutoff Challenge
- **Action**:
  1. Open Planner Tower at `#planner/orders/ORD-2026-MANIPAL-50`.
  2. The interactive SVG **Godown Route Map** highlights Udupi Central, Mangalore Depot, and Manipal Shop #14.
  3. Select **"Safe Inter-Order Swap (Mangalore Buffer → Manipal)"** using donor order `ORD-2026-KUNDAPURA-30`.
  4. **Run Cutoff Challenge**:
     - **Safe Test**: Enter `16:30` (>= 16:00 required) → Banner turns **Green**: `FEASIBLE (ALL ON TIME)`. Both Manipal and Kundapura arrive on time.
     - **Unsafe Test**: Change cutoff to `14:30` (90 min early) → Banner turns **Red**: `UNSAFE CUTOFF`. Explicitly explains: *"Manipal Retail (#14) misses 17:00 arrival by 125 min and donor Kundapura #7 misses replenishment window."*
  5. **Non-Mutating Guard**: Verify saved allocations remain unchanged throughout simulations.
  6. **Blocked Approval**: In the Recovery Approval card, the "Approve Recovery" button is **strictly blocked** with a red warning banner.
- **Verification Status**:
  - `[FIXTURE-VERIFIED]`: Validated in automated tests `PT-01`, `PT-02`, `PV-01`, `PV-02`, `PV-03`.
  - `[PENDING]`: P2 `/planner/orders/{id}/cutoff-preview` live endpoint.

---

### Step 4: Feasible Approval & P4 Case Steering
- **Action**:
  1. Set cutoff back to `16:30` → Banner turns **Green**.
  2. Enter approver name `"Chief Dispatcher"` and click **"Approve Recovery"**.
  3. Order status updates to **Resolved**, backlog units drop to **0**, and audit receipt is displayed.
  4. Scroll to **Historical Case Panel (P4)**:
     - Drag **Query Steering Slider** from `0%` (Original query: *"50 industrial pedestal fans short 10 units..."*) to `100%` (Steered template: *"Inter-depot buffer swap from Mangalore..."*).
     - Fixed 2D SVG embedding projection dynamically rescales and recolors points as similarity changes.
     - Click point `CASE-2025-089` to view **Evidence Citation** (`LOG-2025-089-EV`) and tabbed role briefings (Planner, Warehouse, Purchasing).
- **Verification Status**:
  - `[FIXTURE-VERIFIED]`: Validated in automated tests `PT-03`, `PV-04`.
  - `[PENDING]`: P4 `/cases/steer` and `/cases/query` live embedding vectors.

---

### Step 5: Purchasing Review with Separate PO & Email Receipts
- **Action**:
  1. Scroll to **Purchasing Review** card.
  2. Inspect shortage breakdown: SKU `FAN-HV-24-IND`, Shortage: 10 units, Unit Price: ₹3,700, Total: ₹37,000, Supplier ETA: Nov 29, Batch: `BAT-2026-F44`.
  3. **Step 1 (PO)**: Click **"Create Purchase Order…"** → Inspect preview dialog → Click **"Confirm: Create PO"** → Receipt generated with PO `#PO-2026-8841-A`.
  4. **Step 2 (Email)**: Supplier email button unlocks → Click **"Send Supplier Email…"** → Confirm → Receipt generated with Message ID `#MSG-SUPP-8841` sent to `dispatch@havells-karnataka.com`.
- **Verification Status**:
  - `[FIXTURE-VERIFIED]`: Verified in `PurchasingReviewPanel.tsx`.
  - `[PENDING]`: P2 `/planner/orders/{id}/purchasing/po` and `/purchasing/email` endpoints.

---

## PS3 Scientific User Evaluation
- Navigate to `#evaluation` to view the Within-Subjects User Study:
  - **Latin-square Counterbalancing**: Automatically alternates `Interactive Tower → Text Baseline` (Group A) vs `Text Baseline → Interactive Tower` (Group B).
  - **Text-Only Baseline**: Identical facts, numbers, and cutoff rules without spatial Godown maps.
  - **Anonymous Results Summary**: Renders latency, optimal decision rate, broken donor promise rate, and perceived control scores (1–5 Likert).
  - **Export JSON for P4**: One-click download of structured experimental trial results for academic write-up.

---

## Live Integration Status Summary

| Step | Capability | Component | Status | Dependency |
|---|---|---|---|---|
| 1 | Physical count 50→40 | Customer & Planner fixtures | `[LIVE-VERIFIED]` | P1 inventory engine event bus |
| 2 | Split offer & Insist | `OrderPortalPage.tsx` | `[FIXTURE-VERIFIED]` | P2 order lifecycle API |
| 3 | Godown Map & Cutoff | `CutoffChallengePanel.tsx` | `[FIXTURE-VERIFIED]` | P2 route engine simulation |
| 4 | Versioned Approval & P4 Steering | `RecoveryApprovalPanel.tsx` | `[FIXTURE-VERIFIED]` | P4 case embedding service |
| 5 | Purchasing PO & Email | `PurchasingReviewPanel.tsx` | `[FIXTURE-VERIFIED]` | P2 purchasing gateway |
| 6 | PS3 Evaluation Study | `EvaluationWorkspacePage.tsx` | `[FIXTURE-VERIFIED]` | Standalone frontend within-subjects engine |
