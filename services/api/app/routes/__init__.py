"""API route modules package."""

from app.routes.auth import router as auth_router
from app.routes.events import router as events_router
from app.routes.feeds import router as feeds_router
from app.routes.health import router as health_router
from app.routes.inventory import router as inventory_router
from app.routes.network import router as network_router
from app.routes.offers import router as offers_router
from app.routes.orders import router as orders_router
from app.routes.plans import router as plans_router
from app.routes.production import router as production_router
from app.routes.recovery import router as recovery_router
from app.routes.stock import router as stock_router
from app.routes.stream import router as stream_router

__all__ = [
    "auth_router",
    "events_router",
    "feeds_router",
    "health_router",
    "inventory_router",
    "network_router",
    "offers_router",
    "orders_router",
    "plans_router",
    "production_router",
    "recovery_router",
    "stock_router",
    "stream_router",
]
