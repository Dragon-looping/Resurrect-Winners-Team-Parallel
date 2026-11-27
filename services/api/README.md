# SETUVYUHA API

Backend inventory event-processing service for the **SETUVYUHA** hackathon project, built with FastAPI, SQLAlchemy 2.x, Alembic, and PostgreSQL.

## Project Structure

```text
services/api/
├── alembic/
│   ├── versions/
│   │   ├── 0001_initial_inventory_tables.py
│   │   ├── 0002_add_quarantined_events.py
│   │   └── 0003_add_feed_health.py
│   ├── env.py
│   └── script.py.mako
├── app/
│   ├── core/
│   │   ├── config.py
│   │   ├── database.py
│   │   └── events_bus.py
│   ├── inventory/
│   │   ├── demo.py
│   │   ├── engine.py
│   │   ├── feeds.py
│   │   ├── ingestion.py
│   │   ├── quarantine.py
│   │   └── replay.py
│   ├── models/
│   ├── routes/
│   ├── schemas/
│   └── main.py
├── tests/
├── .env.example
├── .gitignore
├── alembic.ini
├── README.md
└── requirements.txt
```

## Local Setup (Windows PowerShell)

1. Navigate to the API directory:

```powershell
cd services\api
```

2. Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

3. Install dependencies:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

4. Configure environment variables:

```powershell
Copy-Item .env.example .env
```

Edit `.env` to point `DATABASE_URL` to your PostgreSQL instance:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/setuvyuha
FEED_STALE_THRESHOLD_SECONDS=60
```

## Database Migrations (Alembic)

Run migrations against the configured `DATABASE_URL`:

```powershell
alembic upgrade head
```

## Running the API Server

```powershell
uvicorn app.main:app --reload
```

- **Health:** `http://127.0.0.1:8000/health`
- **Swagger UI:** `http://127.0.0.1:8000/docs`
- **SSE Live Stream:** `http://127.0.0.1:8000/stream`

## Running Tests

```powershell
pytest -v
```

## API Usage Examples

### Ingest an Inventory Event (`POST /events`)

```json
{
  "source": "wms-udupi",
  "external_event_id": "udupi-fans-001",
  "plant_id": 2,
  "sku_id": 1,
  "event_type": "STOCK_RECEIVED",
  "quantity": 50,
  "source_sequence": 1,
  "occurred_at": "2026-11-27T08:00:00Z",
  "metadata": { "dock": "D1" }
}
```

### Physical Count Correction (`POST /events`)

```json
{
  "source": "cycle-count-udupi",
  "external_event_id": "udupi-count-001",
  "plant_id": 2,
  "sku_id": 1,
  "event_type": "PHYSICAL_COUNT",
  "quantity": 40,
  "source_sequence": 1,
  "occurred_at": "2026-11-27T09:00:00Z"
}
```

### Deterministic Replay (`POST /inventory/replay`)

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/inventory/replay"
```

### Feed Heartbeat (`POST /feeds/heartbeat`)

```json
{
  "source": "wms-udupi",
  "stale_threshold_seconds": 60
}
```

## Demo Scenario

Canonical demo plants (`Mangaluru`, `Udupi`, `Manipal`) and SKUs (`Electric fans`, `Motors`, `Copper wire`) are defined in `app/inventory/demo.py` (`seed_demo_catalog`) and `app/fulfilment/demo.py` (`seed_order_lifecycle_demo`), and verified end-to-end in `tests/test_demo_scenario.py` and `tests/test_order_lifecycle_integration.py`. Demo records are never inserted automatically into production databases.

## Order Lifecycle Endpoints

- `POST /orders` — Create a customer order (preserves original CRD).
- `GET /orders` — List orders with pagination and filters (`plant_id`, `sku_id`, `status`).
- `GET /orders/{order_id}` — Fetch order details.
- `GET /orders/{order_id}/history` — View lifecycle status audit trail.
- `POST /orders/{order_id}/status` — Apply validated status transition.
- `POST /orders/allocate` — Allocate inventory by `(agreed_delivery_date, created_at, id)`.
- `POST /orders/{order_id}/release` — Release active reservations back to available stock.
- `GET /orders/{order_id}/allocations` — List order allocations.
- `GET /orders/backlog` & `GET /orders/risk` — Backlog and delivery risk (distinguishing stale feeds from shortages).
- `POST /orders/{order_id}/offers` & `POST /offers/{offer_id}/reply` — Customer delivery offers and replies (CRD preserved).
- `POST /orders/{order_id}/plans` & `POST /plans/{plan_id}/approve` — Deterministic plan preview and transactional approval.
- `POST /production/batches`, `GET /production/batches`, `POST /production/batches/{batch_id}/complete` — Production batch readiness and idempotent output receipt.
