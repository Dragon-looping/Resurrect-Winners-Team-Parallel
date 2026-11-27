# Planner Workspace Handoff — Branch 2

## Planner URL

```
http://localhost:5173/planner/orders/ORD-2026-MANIPAL-50
```

Navigate to other seeded orders:
- `http://localhost:5173/planner/orders/ORD-2026-KUNDAPURA-30` (on-track donor)
- `http://localhost:5173/planner/orders/ORD-2026-BRAHMAVAR-20-PUMP` (critical shortage, unavoidable delay demo)

## Fixture Reset

**In the browser UI**: Click the **"Reset Fixtures"** button (top-right of Planner Workspace).

**In the browser console**:
```javascript
import { resetPlannerFixtures } from '/src/planner/adapters/plannerAdapter.ts';
resetPlannerFixtures();
location.reload();
```

## Planner Test Cases

| ID | Test | Expected |
|----|------|----------|
| PT-01 | Safe cutoff (16:30) for CAND-SWAP-MANGALORE | Feasible preview, all outcomes on-time |
| PT-02 | Unsafe cutoff (14:30) for CAND-SWAP-MANGALORE | Infeasible preview with unsafeReason |
| PT-03 | Feasible approval with safe preview | riskStatus → resolved, backlogUnits → 0 |
| PT-04 | Approve CAND-WAIT-REPLENISH (infeasible) | Throws /infeasible/i |
| PT-05 | Approve with unsafe preview | Throws /infeasible|unsafe/i |
| PT-06 | Approve with stale version (999) | Throws /stale|version/i |
| PT-07 | Record unavoidable delay on pump order | riskStatus → unavoidable_delay |
| PT-08 | Planner store isolation from customer store | No customer-only IDs in planner list |

## Critical UI Flows (manual verification)

1. **Safe → Unsafe cutoff change**:
   - Open `ORD-2026-MANIPAL-50`
   - Select `CAND-SWAP-MANGALORE` (Mangalore Swap)
   - In Cutoff Challenge: enter `16:30` → feasible preview shown
   - Change to `14:30` → infeasible red banner with reason
   - Recovery Approval panel shows "APPROVAL BLOCKED"

2. **Feasible approval**:
   - Run safe cutoff (16:30) preview
   - Enter approver name → "Approve Recovery" button enabled
   - After approval: riskStatus = resolved, receipt shown, backlog = 0

3. **Unavoidable delay** (pump order):
   - Open `ORD-2026-BRAHMAVAR-20-PUMP`
   - All candidates infeasible → "Record Unavoidable Delay" section visible
   - Enter delay note → submit → receipt shown

4. **P4 steering slider**:
   - Slide from 0 → 100 to steer from original to steered query
   - Plot points rescale and recolour by interpolated similarity
   - Click a point → role briefings in tabbed view

5. **PO + Email approvals**:
   - Open any order with shortage > 0
   - Enter approver name → "Create Purchase Order…" → shows preview → Confirm
   - After PO: "Send Supplier Email…" becomes enabled → preview → Confirm
   - Both show receipts with IDs and timestamps

## Base SHA Dependency

Branch 2 (`feat/planner-workspace`) is based on `15805e9` (merged customer portal, PR #8).
The web shell, shared types (`findCatalogItem`, `getUnitLabel`, `formatters.ts`), and CSS
variables come from that merged base. Do not cherry-pick without the customer portal.

## Live API Gaps (flag for P2)

| Endpoint | Status |
|----------|--------|
| `GET /planner/orders` | Pending — using fixture list |
| `GET /planner/orders/{id}` | Pending — using fixture store |
| `POST /planner/orders` | Pending — using fixture create |
| `POST /planner/orders/{id}/candidate` | Pending — using fixture select |
| `POST /planner/orders/{id}/cutoff-preview` | Pending — using fixture simulation |
| `POST /planner/orders/{id}/approve` | Pending — using fixture approval |
| `POST /planner/orders/{id}/reject` | Pending — using fixture rejection |
| `POST /planner/orders/{id}/unavoidable-delay` | Pending — using fixture delay |
| `POST /planner/orders/{id}/purchasing/po` | Pending — using fixture PO |
| `POST /planner/orders/{id}/purchasing/email` | Pending — using fixture email |
| `EventSource /planner/orders/{id}/stream` | Pending — using simulated timer ticks |

## Live API Gap (flag for P4)

| Endpoint | Status |
|----------|--------|
| `POST /cases/steer` | Pending — steering slider uses interpolated fixture scores |
| `POST /cases/query` | Pending — query display is fixture text; no live embedding lookup |

## Switching to Live Mode

Toggle the **LIVE API** button in the top-right of Planner Workspace. All calls go to
`http://localhost:8000/planner/...`. Errors from missing endpoints are shown inline — the
UI never hides them.

## Commit Log (Branch 2)

```
feat(planner): add planner routes, navigation, and typed fixture/live adapter
feat(planner): add planner order intake and outstanding-order queue
feat(planner): display live telemetry, backlog, stock-out risk, and stale-feed warnings
feat(planner): show split/later offers, customer responses, and permitted actions
feat(planner): build interactive godown route map
feat(planner): add truck cutoff challenge preview without mutating saved plan
feat(planner): compare wait, spare sourcing, and swap costs with margin and penalty
feat(planner): add versioned recovery approval, rejection, stale-preview guard, and unavoidable delay
feat(planner): integrate P4 historical-case panel with steering slider, 2D plot, and evidence briefings
feat(planner): add purchasing review with shortage, batch, supplier ETA, and separate PO/email approvals
test(planner): verify safe and unsafe cutoff flows, feasible approval, and delay; run typecheck and build
```
