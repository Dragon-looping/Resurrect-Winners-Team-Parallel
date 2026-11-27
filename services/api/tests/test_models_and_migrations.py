"""Tests for SQLAlchemy ORM models, constraints, and Alembic migrations."""

from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import Base, create_db_engine
from app.models import InventoryBalance, InventoryEvent, InventoryEventType, Plant, SKU


def _make_session(tmp_path: Path) -> Session:
    db_file = tmp_path / "models_test.db"
    engine = create_db_engine(f"sqlite+pysqlite:///{db_file.as_posix()}")
    Base.metadata.create_all(bind=engine)
    return Session(bind=engine)


def test_alembic_upgrade_and_downgrade(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify Alembic migrations upgrade to head and downgrade to base cleanly."""
    api_dir = Path(__file__).resolve().parents[1]
    db_file = tmp_path / "alembic_test.db"
    db_url = f"sqlite+pysqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", db_url)

    alembic_cfg = Config(str(api_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(api_dir / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)

    command.upgrade(alembic_cfg, "head")

    engine = create_db_engine(db_url)
    try:
        tables = set(inspect(engine).get_table_names())
        assert {"plants", "skus", "inventory_events", "inventory_balances", "alembic_version"} <= tables
    finally:
        engine.dispose()

    command.downgrade(alembic_cfg, "base")

    engine = create_db_engine(db_url)
    try:
        tables_after = set(inspect(engine).get_table_names())
        assert "plants" not in tables_after
        assert "inventory_events" not in tables_after
    finally:
        engine.dispose()


def test_plant_and_sku_unique_constraints(tmp_path: Path) -> None:
    """Verify Plant.name and SKU.sku_code enforce uniqueness."""
    with _make_session(tmp_path) as session:
        session.add(Plant(name="Udupi", location="Udupi, Karnataka"))
        session.add(SKU(sku_code="FAN-EL-001", name="Electric fans", unit="units"))
        session.commit()

        session.add(Plant(name="Udupi", location="Duplicate Location"))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.add(SKU(sku_code="FAN-EL-001", name="Other Fan", unit="units"))
        with pytest.raises(IntegrityError):
            session.commit()


def test_inventory_event_foreign_keys_and_unique_source_event(tmp_path: Path) -> None:
    """Verify InventoryEvent enforces FKs and (source, external_event_id) uniqueness."""
    with _make_session(tmp_path) as session:
        plant = Plant(name="Mangaluru", location="Mangaluru, Karnataka")
        sku = SKU(sku_code="MTR-001", name="Motors", unit="units")
        session.add_all([plant, sku])
        session.commit()

        bad_event = InventoryEvent(
            source="erp-sync",
            external_event_id="evt-bad-fk",
            plant_id=9999,
            sku_id=sku.id,
            event_type=InventoryEventType.STOCK_RECEIVED.value,
            quantity=10,
            source_sequence=1,
            occurred_at=datetime.now(timezone.utc),
            metadata_json={},
        )
        session.add(bad_event)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        now = datetime.now(timezone.utc)
        evt1 = InventoryEvent(
            source="erp-sync",
            external_event_id="evt-001",
            plant_id=plant.id,
            sku_id=sku.id,
            event_type=InventoryEventType.STOCK_RECEIVED.value,
            quantity=25,
            source_sequence=1,
            occurred_at=now,
            metadata_json={"batch": "B1"},
        )
        session.add(evt1)
        session.commit()

        dup = InventoryEvent(
            source="erp-sync",
            external_event_id="evt-001",
            plant_id=plant.id,
            sku_id=sku.id,
            event_type=InventoryEventType.STOCK_RECEIVED.value,
            quantity=25,
            source_sequence=2,
            occurred_at=now,
            metadata_json={},
        )
        session.add(dup)
        with pytest.raises(IntegrityError):
            session.commit()


def test_inventory_balance_constraints(tmp_path: Path) -> None:
    """Verify InventoryBalance enforces unique (plant_id, sku_id) and non-negative stocks."""
    with _make_session(tmp_path) as session:
        plant = Plant(name="Manipal", location="Manipal, Karnataka")
        sku = SKU(sku_code="CWR-001", name="Copper wire", unit="meters")
        session.add_all([plant, sku])
        session.commit()

        bal = InventoryBalance(
            plant_id=plant.id,
            sku_id=sku.id,
            physical_stock=100,
            reserved_stock=20,
            confirmed_arrivals=0,
            available_stock=80,
        )
        session.add(bal)
        session.commit()

        neg_bal = InventoryBalance(
            plant_id=plant.id,
            sku_id=sku.id,
            physical_stock=-5,
            reserved_stock=0,
            confirmed_arrivals=0,
            available_stock=-5,
        )
        session.add(neg_bal)
        with pytest.raises(IntegrityError):
            session.commit()
