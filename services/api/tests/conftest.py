"""Shared pytest fixtures for isolated database and API testing."""

from collections.abc import Generator
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import Base, create_db_engine, get_db
from app.main import create_app
from app.models import Plant, SKU


@pytest.fixture()
def db_session(tmp_path: Path) -> Generator[Session, None, None]:
    """Provide an isolated SQLite database session per test."""
    db_file = tmp_path / "test_setuvyuha.db"
    engine = create_db_engine(f"sqlite+pysqlite:///{db_file.as_posix()}")
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(
        bind=engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        class_=Session,
    )
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """Provide a FastAPI TestClient wired to the isolated test database session."""
    app = create_app()

    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def seeded_catalog(db_session: Session) -> dict[str, object]:
    """Seed canonical SETUVYUHA plants and SKUs into the isolated test database."""
    mangaluru = Plant(name="Mangaluru", location="Mangaluru, Karnataka")
    udupi = Plant(name="Udupi", location="Udupi, Karnataka")
    manipal = Plant(name="Manipal", location="Manipal, Karnataka")

    fans = SKU(sku_code="FAN-EL-001", name="Electric fans", unit="units")
    motors = SKU(sku_code="MTR-IND-001", name="Motors", unit="units")
    copper = SKU(sku_code="CWR-001", name="Copper wire", unit="meters")

    db_session.add_all([mangaluru, udupi, manipal, fans, motors, copper])
    db_session.commit()

    return {
        "plants": {"Mangaluru": mangaluru, "Udupi": udupi, "Manipal": manipal},
        "skus": {"Electric fans": fans, "Motors": motors, "Copper wire": copper},
    }
