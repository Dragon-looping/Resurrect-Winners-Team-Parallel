"""Pydantic schemas for service health endpoints."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Response payload returned by the health check endpoint."""

    status: str = Field(default="healthy", description="Current operational status of the API.")
    service: str = Field(default="setuvyuha-api", description="Identifier of the running service.")
