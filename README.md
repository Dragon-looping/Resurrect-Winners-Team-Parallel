# SETUVYUHA — Intelligent Logistics & Dispatch Engine

> Hackathon Project · Team Parallel · Branch 1: Customer Portal (`feat/customer-portal`)

SETUVYUHA is an intelligent dispatch and fulfilment engine built for complex supply chain logistics, dynamically re-routing and resolving inventory disruptions between regional hubs (Udupi Central, Mangalore Depot, Bengaluru).

This repository contains **Branch 1 (`feat/customer-portal`)**, owned by **Person 3 (Frontend Engineer & Product Designer)**.

---

## Benchmark Scenario: The Manipal Fan Order
* A commercial retail shop in **Manipal** requests **50 high-velocity industrial fans by Friday, Nov 27, 2026**.
* The **Udupi regional warehouse** initially records 50 units, but a physical count reconciliation adjusts available immediately staged stock to **40 units**.
* The customer is presented with three distinct, consequential choices:
  1. **Accept Split Delivery**: 40 fans delivered on Friday, Nov 27, and 10 fans delivered on Sunday, Nov 29 via regional buffer.
  2. **Consider Later Single Delivery**: All 50 fans delivered together on Tuesday, Dec 01.
  3. **Insist on Original Terms**: All 50 fans delivered together by the original Friday deadline (triggers an emergency inter-hub scan; missing stock is never falsely claimed as found).

---

## Art Direction & Visual Identity

The customer portal is designed as a **contemporary logistics dispatch document**:
* **Canvas**: Warm off-white (`#FAF8F5`) representing high-grade paper manifest stock.
* **Ink**: Near-black charcoal ink (`#18181B`) for text and strict tabular alignment.
* **Rules**: Crisp hairline border rules (`1px solid #E7E5E4`) separating decisions and audit ledgers.
* **Accent**: Single deep oxide-red (`#991B1B`) reserved for primary consequential actions and critical alerts.
* **Typography**: Expressive compact headline face (*Barlow Condensed*) paired with an ultra-legible body face (*Inter*). All quantities, reference IDs, and dates use tabular numerals (`font-variant-numeric: tabular-nums`).
* **Grayscale & Accessibility**: Zero purple/violet gradients, glowing buttons, or decorative AI jargon. All status indicators pair explicit text with icons so meaning survives in monochrome.

### Observed Pattern → SETUVYUHA Decision Notes
1. **Aesop & Editorial Storefronts (Visual restraint & spatial rhythm)**: Observed how high-end editorial layouts use warm off-white canvases, dark charcoal ink, and hairline rules rather than heavy card containers. *SETUVYUHA decision:* We designed the customer portal as a physical dispatch note (`#FAF8F5` warm background, `#18181B` ink, `1px` crisp border rules) with zero gradient cards, glassmorphism, or purple badges.
2. **FedEx Tracking (Shipment hierarchy & tabular split dates)**: Observed how parcel tracking surfaces master reference numbers and splits multi-package journeys into distinct, tabular date/quantity rows. *SETUVYUHA decision:* At the split offer and confirmation screens, we use a ruled shipment list where quantities and arrival dates align strictly with tabular numerals (`font-variant-numeric: tabular-nums`), ensuring a customer can scan "40 fans — Fri, Nov 27" and "10 fans — Sun, Nov 29" within five seconds on mobile.
3. **GOV.UK Design System (Consequential summary lists & explicit actions)**: Observed how public services use summary lists to separate what was requested from what is confirmed, with descriptive decision buttons rather than generic "Submit" or "Yes/No". *SETUVYUHA decision:* We explicitly differentiate "Requested", "Offered", and "Confirmed" states side-by-side, providing descriptive consequential actions ("Accept split delivery", "Keep all 50 together by Friday") and resilient field-level validation errors.

---

## 5-Second Mobile Glance Test Verification
When viewing the signature split offer at 390px (and 320px):
* **Where does the eye land first?** The high-contrast ruled split offer box with bold tabular numerals: `40 FANS` and `10 FANS`.
* **Can both quantities and exact arrival dates be identified without opening anything?** Yes: `40 FANS — Fri, Nov 27, 2026` and `10 FANS — Sun, Nov 29, 2026` are fully visible above the fold.
* **Is it obvious these are proposed dates?** Yes: A prominent amber banner (`PROPOSED ALLOCATION · NOT YET AGREED`) and explicit `[PROPOSED DATE]` badges are displayed.
* **Can declining be distinguished from insisting on original terms?** Yes: Separate buttons with explicit copy: *"Consider later single delivery (All 50 on Tue)"* vs *"Keep all 50 together by Friday (Insist)"*.
* **After accepting and refreshing, is the change clear?** Yes: Transitions to a forest-green border (`AUTHORITATIVE SCHEDULE CONFIRMED`), generates tracking IDs (`STV-UD-4081`, `STV-UD-4082`), sets the Fulfilment Ledger balance to 0 outstanding, and persists across browser refreshes.

---

## Quick Start & Verification Commands

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev
# -> Opens on http://localhost:5173/

# 3. Run automated tests (Unit, Scenarios, Version checks, State transitions)
npm test

# 4. Run TypeScript typecheck
npm run typecheck

# 5. Build production bundle
npm run build
```

---

## Application Routes & Seeded Scenarios

| Route | View Description | Scenario Key |
| :--- | :--- | :--- |
| `/customer/request` | Delivery Request Intake | Validates SKU, quantity, arrival date, destination, single load flag |
| `/customer/orders/ORD-2026-MANIPAL-50` | Signature Split Offer | 40 fans on Friday, 10 fans on Sunday (Udupi count adjusted to 40) |
| `/customer/orders/ORD-2026-MANIPAL-CLARIFY` | Inline Clarification | Resolves delivery arrival vs dispatch timing without losing entered values |
| `/customer/orders/ORD-2026-MANIPAL-LATER` | Later Single Delivery | All 50 units consolidated on Tuesday, Dec 01 |
| `/customer/orders/ORD-2026-MANIPAL-PENDING` | Original Terms Insisted | Emergency inter-hub recovery scan (does not claim stock is found) |
| `/customer/orders/ORD-2026-MANIPAL-CONFIRMED-SPLIT` | Confirmed Split Schedule | 2 staged shipments with tracking refs |
| `/customer/orders/ORD-2026-MANIPAL-DELAY` | Unavoidable Delay / Backlog | 40 units dispatched; 10 units delayed with customer-facing reason |
| `/customer/orders/ORD-2026-MANIPAL-EXPIRED` | Expired Offer | Stale 30-min window closed; one-click stock renewal |

---

## Integration Handoff for Teammates

### Person 2 (Backend / Contracts & Workflow)
* **Endpoints Consumed**:
  * `POST /orders`: Creates new delivery request.
  * `GET /orders/{id}`: Retrieves authoritative order state, version number, active offers, and confirmed shipments.
  * `POST /offers/{id}/reply`: Accepts `{ offerId, offerVersion, decision: 'accept_split' | 'accept_later' | 'insist_original' | 'decline' }`.
* **State & Version Checks**:
  * Frontend includes `offerVersion` in all replies. A version mismatch yields a non-destructive recovery prompt.
  * Timeout recovery: An ambiguous network timeout invokes `GET /orders/{id}` before prompting retry to avoid duplicate execution.
* **Customer Payload Boundary**:
  * Supplier procurement costs, internal warehouse margin metrics, and LLM provider credentials must never appear in customer responses.

### Person 4 (Clarification / Agent)
* **Endpoint Consumed**:
  * `POST /clarify`: Accepts `{ orderId, questionId, selectedOptionId }`.
  * Inline presentation: Renders targeted questions while keeping customer’s pre-filled parameters intact.
