# SETUVYUHA AI Gateway (`services/api/app/ai`)

**Owner:** Person 4 — Branch 1 (`feat/ai-gateway`)
**Scope:** Centralized AI Gateway supporting Groq and Google Gemini with automatic failover, strict output validation, provider health/cooldown tracking, and deterministic fallback.

> **Scope Boundary:** Embeddings, vector steering, ambiguity resolution workflows, procurement/PO drafting, and role-specific briefings belong to subsequent Person 4 branches and are intentionally excluded here.

---

## 1. Phase 0 Repository Notes & Missing Shared Contracts

When `feat/ai-gateway` was branched from `main` (`9a40f0b`), the repository contained only `README.md` and `.github/CODEOWNERS`. Because `services/api/app/main.py` and teammate domain modules have not been merged to `main` yet, this branch:

1. **Does not create a second `FastAPI()` application** (`services/api/app/main.py` is left for the backend owner).
2. Exposes a mountable `ai_router` (`services/api/app/ai/router.py`) and a typed Python service (`AIGatewayService`).
3. Proposes compatible shared interfaces for missing upstream contracts:
   - **App Mounting (`services/api/app/main.py`)**: Mount via `app.include_router(ai_router)`.
   - **App Settings**: `GatewayConfig.from_env()` reads environment variables directly and can later accept a dict or settings mapping without changing its contract.
   - **Structured Logging**: Uses Python's standard `logging` (`setuvyuha.ai.gateway`), emitting JSON strings with API keys redacted.
   - **Calculation Engine Boundary (P2/P3)**: Backend calculation engines pass factual values via `AuthoritativeMetrics` and `EvidenceItem`; the AI Gateway never mutates or recalculates those values.

---

## 2. Environment Configuration

Copy `.env.example` to `.env` (never commit `.env`):

```dotenv
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

AI_PRIMARY_PROVIDER=groq
AI_REQUEST_TIMEOUT=10
AI_PROVIDER_TIMEOUT=4
AI_PROVIDER_COOLDOWN_SECONDS=30
```

- **Hard limits enforced by `GatewayConfig`:**
  - `AI_REQUEST_TIMEOUT <= 10` seconds (total request deadline).
  - `AI_PROVIDER_TIMEOUT <= 4` seconds (single attempt deadline per provider).
  - SDK internal retries are disabled (`max_retries=0` on Groq, `HttpRetryOptions(attempts=1)` on Gemini) so failover stays strictly inside the 10s deadline.
- **Startup / First-Use Validation:**
  - `GatewayConfig.from_env()` validates timeout bounds and `AI_PRIMARY_PROVIDER` immediately.
  - `config.validate_startup(require_at_least_one=True)` raises `AIConfigurationError` with missing variable names (`GROQ_API_KEY`, `GROQ_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`) without ever logging secret values.

---

## 3. Architecture & Failover Behavior

```text
Caller (P2 / P3 / Future P4)
        │
        ▼
  AIGatewayService.execute(GatewayRequest)
        │
        ├──[preferred healthy or cooldown expired (probe)]──▶ Preferred Adapter (<= 4s)
        │        │
        │        ├── Safety Refusal ──▶ Stop immediately (no reroute) -> Deterministic Refusal
        │        ├── Valid Output   ──▶ Return (execution_mode = groq | gemini)
        │        └── Error/Invalid  ──▶ Record health/cooldown
        │
        ├──[remaining deadline > 0.05s & !has_completed_side_effect]──▶ Backup Adapter (<= 4s)
        │        │
        │        ├── Valid Output   ──▶ Return (fallback_used = True, service_status = degraded)
        │        └── Error/Invalid  ──▶ Record health/cooldown
        │
        ▼
  DeterministicFallbackService ──▶ Return (execution_mode = deterministic, fallback_used = True)
```

---

## 4. How Person 2 and Person 3 Consume the Gateway

### Direct Python Service Usage (Recommended for Backend Services)

```python
from app.ai import (
    AuthoritativeMetrics,
    EvidenceItem,
    GatewayRequest,
    TaskType,
    get_ai_gateway,
)

gateway = get_ai_gateway()

request = GatewayRequest(
    task_type=TaskType.EXPLANATION,
    prompt="Explain why transferring 120 units from Godown-B resolves the Pune shortfall.",
    evidence=[
        EvidenceItem(
            evidence_id="ev-stock-gd-b-01",
            source_type="stock_record",
            summary="Godown-B has 200 surplus units of SKU-402.",
            authoritative_values={"available_qty": 200},
        ),
        EvidenceItem(
            evidence_id="ev-cost-swap-01",
            source_type="calculation_result",
            summary="Net transfer cost INR 4500, projected margin INR 18500.",
            authoritative_values={"transfer_cost": 4500.0, "projected_margin": 18500.0},
        ),
    ],
    authoritative_metrics=AuthoritativeMetrics(
        quantities={"transfer_qty": 120, "surplus_qty": 200},
        monetary_amounts={"transfer_cost": 4500.0, "projected_margin": 18500.0},
        currency="INR",
        dates={"dispatch_date": "2026-11-28"},
    ),
    required_fields=["summary", "explanation"],
)

response = await gateway.execute(request)
```

### Mounting the Optional FastAPI Router (`services/api/app/main.py`)

```python
from fastapi import FastAPI
from app.ai import ai_router

app = FastAPI(title="SETUVYUHA API")
app.include_router(ai_router)
```

Endpoints exposed when mounted:
- `GET /ai/health` — Returns per-provider readiness, model IDs, cooldown state, and overall status (`healthy`, `degraded`, `fallback_only`).
- `POST /ai/gateway/execute` — Executes a `GatewayRequest` and returns `GatewayResponse`.

---

## 5. Sample Request & Response Payloads

### Sample Request (`POST /ai/gateway/execute`)

```json
{
  "request_id": "2c8d1f7a-4b11-4f88-9f1a-0c8b2c4e1234",
  "task_type": "explanation",
  "prompt": "Summarize the approved inter-godown transfer for SKU-402.",
  "evidence": [
    {
      "evidence_id": "ev-swap-101",
      "source_type": "calculation_result",
      "summary": "Transfer 120 units from Godown-B to Godown-A on 2026-11-28.",
      "authoritative_values": {"transfer_qty": 120, "transfer_cost": 4500.0}
    }
  ],
  "authoritative_metrics": {
    "quantities": {"transfer_qty": 120},
    "monetary_amounts": {"transfer_cost": 4500.0},
    "currency": "INR",
    "dates": {"dispatch_date": "2026-11-28"}
  },
  "required_fields": ["summary"]
}
```

### Sample Response (`execution_mode = "groq"`)

```json
{
  "request_id": "2c8d1f7a-4b11-4f88-9f1a-0c8b2c4e1234",
  "task_type": "explanation",
  "execution_mode": "groq",
  "preferred_provider": "groq",
  "actual_provider": "groq",
  "model_id": "llama-3.3-70b-versatile",
  "latency_ms": 312.45,
  "attempts": 1,
  "error_category": "none",
  "fallback_used": false,
  "validation_status": "passed",
  "service_status": "healthy",
  "output": {
    "summary": "Transfer 120 units of SKU-402 from Godown-B to Godown-A.",
    "explanation": "Based on ev-swap-101, dispatching 120 units on 2026-11-28 costs INR 4500.0.",
    "cited_evidence_ids": ["ev-swap-101"],
    "quantities": {"transfer_qty": 120},
    "monetary_values": {"transfer_cost": 4500.0},
    "currency": "INR",
    "clarification_choices": [],
    "route_to_planner": false,
    "data": {}
  },
  "authoritative_metrics": {
    "quantities": {"transfer_qty": 120},
    "monetary_amounts": {"transfer_cost": 4500.0},
    "currency": "INR",
    "dates": {"dispatch_date": "2026-11-28"},
    "allow_ai_numeric_estimates": false
  },
  "refused": false,
  "warnings": []
}
```

---

## 6. Running Tests

```bash
cd services/api
pip install -r requirements.txt
pytest
```
