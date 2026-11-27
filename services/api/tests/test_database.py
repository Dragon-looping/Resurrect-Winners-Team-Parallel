"""Tests for database configuration, engine creation, and session lifecycle."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import text

from app.core.config import Settings, get_settings
from app.core.database import create_db_engine, get_db, reset_db_state


def test_settings_loads_database_url_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify DATABASE_URL and related settings read from environment variables."""
    custom_url = "postgresql+psycopg://user:pass@db-host:5432/custom_db"
    monkeypatch.setenv("DATABASE_URL", custom_url)
    monkeypatch.setenv("FEED_STALE_THRESHOLD_SECONDS", "120")

    get_settings.cache_clear()
    try:
        settings = get_settings()
        assert settings.database_url == custom_url
        assert settings.feed_stale_threshold_seconds == 120
    finally:
        get_settings.cache_clear()


def test_create_db_engine_supports_postgresql_url_configuration() -> None:
    """Verify PostgreSQL engine initializes lazily with pool_pre_ping enabled."""
    engine = create_db_engine("postgresql+psycopg://postgres:postgres@localhost:5432/setuvyuha")
    try:
        assert engine.dialect.name == "postgresql"
        assert engine.pool._pre_ping is True
    finally:
        engine.dispose()


def test_get_db_session_lifecycle_queries_and_closes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify get_db yields a working Session and closes it on teardown."""
    db_file = tmp_path / "test_lifecycle.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_file.as_posix()}")
    get_settings.cache_clear()
    reset_db_state()

    try:
        gen = get_db()
        session = next(gen)
        result = session.execute(text("SELECT 1")).scalar_one()
        assert result == 1

        with patch.object(session, "close", wraps=session.close) as close_spy:
            with pytest.raises(StopIteration):
                next(gen)
            close_spy.assert_called_once()
    finally:
        reset_db_state()
        get_settings.cache_clear()


def test_get_db_closes_session_even_on_exception(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify get_db closes the session when an exception occurs inside the caller."""
    db_file = tmp_path / "test_exception.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_file.as_posix()}")
    get_settings.cache_clear()
    reset_db_state()

    mock_close = MagicMock()
    try:
        gen = get_db()
        session = next(gen)
        original_close = session.close
        session.close = lambda: (mock_close(), original_close())[1]  # type: ignore[method-assign]

        with pytest.raises(RuntimeError, match="boom"):
            gen.throw(RuntimeError("boom"))

        mock_close.assert_called_once()
    finally:
        reset_db_state()
        get_settings.cache_clear()
