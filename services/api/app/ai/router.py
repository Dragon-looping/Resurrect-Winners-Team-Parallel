"""Mountable FastAPI router for the SETUVYUHA AI Gateway."""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Depends

from .gateway import AIGatewayService, create_default_gateway
from .schemas import GatewayHealthResponse, GatewayRequest, GatewayResponse

ai_router = APIRouter(prefix="/ai", tags=["AI Gateway"])


@lru_cache(maxsize=1)
def get_ai_gateway() -> AIGatewayService:
    """FastAPI dependency returning the process-wide AI Gateway service."""
    return create_default_gateway()


@ai_router.get(
    "/health",
    response_model=GatewayHealthResponse,
    summary="AI Gateway and provider health status",
)
async def ai_gateway_health(
    gateway: AIGatewayService = Depends(get_ai_gateway),
) -> GatewayHealthResponse:
    """Return provider configuration, cooldown, and overall AI Gateway status."""
    return await gateway.health_check()


@ai_router.post(
    "/gateway/execute",
    response_model=GatewayResponse,
    summary="Execute an AI Gateway task with failover and deterministic fallback",
)
async def execute_ai_gateway(
    request: GatewayRequest,
    gateway: AIGatewayService = Depends(get_ai_gateway),
) -> GatewayResponse:
    """Internal/backend endpoint exposing the centralized AI Gateway."""
    return await gateway.execute(request)
