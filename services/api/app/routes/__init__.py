"""API route modules package."""

from app.routes.events import router as events_router
from app.routes.feeds import router as feeds_router
from app.routes.health import router as health_router
from app.routes.inventory import router as inventory_router

__all__ = ["events_router", "feeds_router", "health_router", "inventory_router"]
