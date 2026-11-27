"""Pydantic schemas for service health endpoints."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Response payload returned by the health check endpoint."""

    status: str = Field(default="healthy", description="Current operational status of the API.")
    service: str = Field(default="setuvyuha-api", description="Identifier of the running service.")


class ReadinessResponse(BaseModel):
    """Response payload returned by the database readiness probe."""

    status: str = Field(..., description="Readiness status (ready | unavailable).")
    service: str = Field(default="setuvyuha-api", description="Identifier of the running service.")
    database: str = Field(..., description="Database connectivity state (connected | unreachable).")
    detail: str | None = Field(default=None, description="Sanitized error detail when unavailable.")
