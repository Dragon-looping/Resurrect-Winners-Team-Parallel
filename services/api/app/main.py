"""SETUVYUHA FastAPI application entrypoint mounting P4 Case Steering & Clarification."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cases.router import cases_router
from app.clarification.router import clarification_router

app = FastAPI(
    title="SETUVYUHA API — Case Steering & Clarification",
    version="0.2.0",
    description="Deterministic local case retrieval, vector steering, fixed 2D projection, and ambiguity clarification.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Liveness probe for backend integration."""
    return {"status": "ok", "service": "setuvyuha-case-steering-clarification"}


# Primary routes (/cases/search, /cases/presets, /cases, /clarify)
app.include_router(cases_router)
app.include_router(clarification_router)

# Convenience /api prefix mirror for web LiveApiOrderAdapter (http://localhost:8000/api)
app.include_router(cases_router, prefix="/api", include_in_schema=False)
app.include_router(clarification_router, prefix="/api", include_in_schema=False)
