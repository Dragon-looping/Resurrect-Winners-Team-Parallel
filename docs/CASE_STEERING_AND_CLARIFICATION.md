# SETUVYUHA — Case Steering & Clarification (Person 4 · Branch 2)

> Branch: `feat/case-steering-clarification`  
> Scope: **PS5** (Local Embeddings, Similarity Search, Vector Steering, Fixed 2D Projection, Interactive UI) & **PS6** (Deterministic Ambiguity Detection & Minimal Clarification)

---

## 1. Architecture Overview

| Layer | Location | Purpose |
| :--- | :--- | :--- |
| **Case Embeddings & Steering** | `services/api/app/cases/` | Deterministic 64-D local embeddings, cosine similarity, vector steering, fixed 2D projection, seeded corpus |
| **Ambiguity & Clarification** | `services/api/app/clarification/` | Rule-based deterministic ambiguity detector, conflict finder, minimal targeted questions, safe defaults |
| **FastAPI Entrypoint** | `services/api/app/main.py` | Mounts `cases_router` and `clarification_router` at `/` and `/api` with CORS for `localhost:5173` |
| **Interactive Web Console** | `apps/web/src/cases/` | `CaseSteeringPage.tsx` + `caseSteeringAdapter.ts` integrated under `/cases/steering` |
| **Automated Tests** | `services/api/tests/` | 23 pytest tests covering embeddings, steering, 2D projection, ambiguity detection, and FastAPI endpoints |

---

## 2. PS5 — Local Embeddings, Steering & Fixed 2D Projection

### Local Embedding Approach (`app/cases/embeddings.py`)
- **Zero external APIs / zero paid models**: Pure-Python CPU execution using `hashlib.blake2b` feature hashing (word unigrams, bigrams, character trigrams in dims `0..47`) + 16 interpretable logistics concept axes (dims `48..63`), L2-normalized to `D = 64`.
- **Edge-case safety**: Empty, whitespace-only, punctuation-only, or malformed non-string inputs return a zero-vector with `is_empty=True` and a structured warning instead of crashing.

### Similarity & Vector Steering (`app/cases/service.py`)
- Base similarity uses exact cosine similarity between the normalized query vector $q$ and each indexed case vector $c$.
- When steering is enabled ($\alpha \neq 0$) with a preset (`split_delivery`, `single_load`, `later_consolidation`, `inter_hub_recovery`, `urgent_deadline`), `target_case_id`, or custom 64-D `steering_vector` $d$:
  $$q_{\text{steered}} = \text{normalize}(q + \alpha \cdot \text{normalize}(d))$$
- **Immutability**: Original `HistoricalCase` records and `base_similarity_score` values are never mutated. Both `base_rank` and `rank_delta` are returned.

### Fixed 2D Projection (`app/cases/projection.py`)
- Uses a fixed, seeded Gram-Schmidt orthogonal `2 x 64` projection matrix (`_FIXED_AXIS_X`, `_FIXED_AXIS_Y`) anchored on logistics concept dimensions.
- Coordinates never drift or randomly regenerate across requests or dataset sizes (including 0, 1, or 2 cases).

---

## 3. PS6 — Deterministic Ambiguity Detection & Clarification

`AmbiguityDetectorService` (`app/clarification/detector.py`) runs 100% locally without LLM calls:
1. **Essential vs Optional**: Checks `product_or_sku`, `quantity`, `destination`, `requested_date`, and `date_meaning` (arrival vs dispatch when deadline-bound). Optional fields (`notes`, `preferred_hub`) never block execution.
2. **Conflict Detection**: Flags contradictions such as simultaneous single-load and split-delivery constraints, structured vs text quantity mismatches, non-positive quantities, and arrival-vs-dispatch clashes.
3. **Minimal Targeted Questions**: Never re-asks already-supplied fields; caps questions at 4 prioritized items; labels `safe_defaults` explicitly with `is_suggestion: true`.
4. **P3 Backward Compatibility**: Also accepts `{ orderId, questionId, selectedOptionId }` from `apps/web`'s `LiveApiOrderAdapter`.

---

## 4. API Endpoints & Examples

### `POST /cases/search`
```json
{
  "query": "50 industrial fans Manipal urgent",
  "top_k": 5,
  "steering_direction": "split_delivery",
  "steering_strength": 0.8,
  "include_projection": true
}
```
Returns `results` (ranked `HistoricalCase` hits with `similarity_score`, `base_similarity_score`, `rank_delta`), `projection_points` (corpus + `QUERY_BASE` + `QUERY_STEERED`), and `warnings`.

### `GET /cases/presets` & `GET /cases`
Lists available steering direction presets and indexed historical cases.

### `POST /clarify`
```json
{
  "request_text": "Need 20 submersible pumps"
}
```
Returns:
```json
{
  "clarification_required": true,
  "can_proceed": false,
  "brief_explanation": "Clarification required: missing essential field(s): destination, requested_date.",
  "missing_required_fields": ["destination", "requested_date"],
  "conflicts": [],
  "questions": [...],
  "safe_defaults": [{"field": "requested_date", "suggested_value": "standard_48h_window", "is_suggestion": true}],
  "confidence": 0.55
}
```

---

## 5. Setup, Run & Test Commands

```powershell
# Backend (from services/api)
.\.venv\Scripts\python.exe -m compileall -q app tests
.\.venv\Scripts\python.exe -m pytest -vv --tb=short --timeout=20

# Run API server locally
.\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

## 6. Integration Notes for P2 / P3
- **P2 (Backend)**: Mount `app.cases.router.cases_router` and `app.clarification.router.clarification_router` directly onto the main FastAPI app, or use `app/main.py` as the unified entrypoint.
- **P3 (Frontend)**: The `/cases/steering` route is wired into `apps/web/src/App.tsx` and `apps/web/src/shared/Layout.tsx` using SETUVYUHA's dispatch-document tokens (`#FAF8F5`, `#18181B`, `#991B1B`). Switching the portal to `LIVE API` mode routes `/cases/search` and `/clarify` to `http://localhost:8000/api`.
