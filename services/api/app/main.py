"""Entry point and application factory for the SETUVYUHA FastAPI service."""

from fastapi import FastAPI

from app.core.config import get_settings
from app.routes import (
    events_router,
    feeds_router,
    health_router,
    inventory_router,
    offers_router,
    orders_router,
    production_router,
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

    application.include_router(health_router)
    application.include_router(events_router)
    application.include_router(inventory_router)
    application.include_router(feeds_router)
    application.include_router(stock_router)
    application.include_router(stream_router)
    application.include_router(orders_router)
    application.include_router(offers_router)
    application.include_router(production_router)
    return application


app = create_app()
