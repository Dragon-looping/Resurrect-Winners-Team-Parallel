"""Entry point and application factory for the SETUVYUHA FastAPI service."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cases.router import cases_router
from app.clarification.router import clarification_router
from app.core.config import get_settings
from app.core.database import check_database_connectivity
from app.procurement.router import procurement_router
from app.routes import (
    auth_router,
    events_router,
    feeds_router,
    health_router,
    inventory_router,
    network_router,
    offers_router,
    orders_router,
    plans_router,
    production_router,
    recovery_router,
    stock_router,
    stream_router,
)


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Validate database connectivity on startup with a clear error if unreachable."""
    ok, error_detail = check_database_connectivity()
    if not ok:
        logger.error("Startup database connectivity check failed: %s", error_detail)
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    settings = get_settings()

    application = FastAPI(
        title=settings.app_title,
        description=settings.app_description,
        version=settings.app_version,
        docs_url=settings.docs_url,
        redoc_url=settings.redoc_url,
        openapi_url=settings.openapi_url,
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://localhost:8081",
            "http://127.0.0.1:8081",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Core backend routers from main
    application.include_router(health_router)
    application.include_router(auth_router)
    application.include_router(network_router)
    application.include_router(events_router)
    application.include_router(inventory_router)
    application.include_router(feeds_router)
    application.include_router(stock_router)
    application.include_router(stream_router)
    application.include_router(orders_router)
    application.include_router(offers_router)
    application.include_router(plans_router)
    application.include_router(production_router)
    application.include_router(recovery_router)

    # P4 Case Steering & Clarification routers (root + /api compatibility mirror)
    application.include_router(cases_router)
    application.include_router(clarification_router)
    application.include_router(cases_router, prefix="/api", include_in_schema=False)
    application.include_router(clarification_router, prefix="/api", include_in_schema=False)

    # Branch 3 Procurement & Briefings router (root + /api compatibility mirror)
    application.include_router(procurement_router)
    application.include_router(procurement_router, prefix="/api", include_in_schema=False)

    return application


app = create_app()
