# SETUVYUHA — Integration & Handoff Specification (Person 3 to Person 2 / Person 4)

## Architecture Overview
The web application is structured with a clean separation of concerns:
* `apps/web/src/customer/adapters/orderAdapter.ts`: Typed interface (`IOrderAdapter`) with two interchangeable adapters:
  1. `FixtureOrderAdapter`: Seeded scenario state with `sessionStorage` persistence for offline demos and regression suites.
  2. `LiveApiOrderAdapter`: Directly connects to Person 2's FastAPI / Express backend and Person 4's clarification endpoint.
* `apps/web/src/customer/types/order.ts`: Strict TypeScript contracts matching the backend logistics schema.

## Endpoints Consumed

### 1. Create Order
* **Method / Path**: `POST /orders`
* **Request Body**:
  ```json
  {
    "itemSku": "FAN-HV-24-IND",
    "itemName": "High-Velocity 24\" Industrial Pedestal Fans",
    "quantity": 50,
    "destination": "Manipal Commercial Center, Shop #14",
    "requestedArrivalDate": "2026-11-27",
    "mustArriveTogether": false,
    "notes": "Required for university exhibition opening"
  }
  ```
* **Response**: `CustomerOrder` JSON.

### 2. Get Authoritative Order
* **Method / Path**: `GET /orders/{id}`
* **Response**: Returns current order with `version`, `status`, `activeOffer`, and `confirmedShipments`.

### 3. Reply to Offer
* **Method / Path**: `POST /offers/{id}/reply`
* **Request Body**:
  ```json
  {
    "offerId": "OFF-UDUPI-SPLIT-8841",
    "offerVersion": 1,
    "decision": "accept_split"
  }
  ```
* **Decisions**: `'accept_split' | 'accept_later' | 'insist_original' | 'decline'`

### 4. Inline Clarification
* **Method / Path**: `POST /clarify`
* **Request Body**:
  ```json
  {
    "orderId": "ORD-2026-MANIPAL-CLARIFY",
    "questionId": "Q-DATE-MEANING-01",
    "selectedOptionId": "arrive_by_friday"
  }
  ```

## Mode Selector
The UI includes a mode switcher in the header of the intake form. Switching to `LIVE API` routes all requests to `http://localhost:8000/api` (configurable via `localStorage.setuvyuha_api_base_url`).
Live API failures remain explicitly visible with actionable error banners; fixture fallbacks are never silently substituted during live mode.
