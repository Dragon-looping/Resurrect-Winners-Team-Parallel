"""Entry point and application factory for the SETUVYUHA FastAPI service."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cases.router import cases_router
from app.clarification.router import clarification_router
from app.core.config import get_settings
from app.routes import (
    events_router,
    feeds_router,
    health_router,
    inventory_router,
    offers_router,
    orders_router,
    plans_router,
    production_router,
    recovery_router,
    stock_router,
    stream_router,
)


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
    )

    application.add_middleware(
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

    # Core backend routers from main
    application.include_router(health_router)
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

    return application


app = create_app()
