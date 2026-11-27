"""Application configuration settings for the SETUVYUHA API service."""

from functools import lru_cache
from pydantic import BaseModel


class Settings(BaseModel):
    """Static application metadata and documentation configuration."""

    app_title: str = "SETUVYUHA API"
    app_description: str = "Backend API service for the SETUVYUHA platform."
    app_version: str = "0.1.0"
    service_name: str = "setuvyuha-api"
    docs_url: str = "/docs"
    redoc_url: str = "/redoc"
    openapi_url: str = "/openapi.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached instance of the application settings."""
    return Settings()
