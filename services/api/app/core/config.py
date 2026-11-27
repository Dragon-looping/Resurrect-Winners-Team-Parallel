"""Application configuration settings for the SETUVYUHA API service."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven application and database configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_title: str = "SETUVYUHA API"
    app_description: str = "Backend API service for the SETUVYUHA platform."
    app_version: str = "0.1.0"
    service_name: str = "setuvyuha-api"
    app_env: str = "development"
    docs_url: str = "/docs"
    redoc_url: str = "/redoc"
    openapi_url: str = "/openapi.json"

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/setuvyuha"
    sql_echo: bool = False
    feed_stale_threshold_seconds: int = 60


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached instance of the application settings."""
    return Settings()
