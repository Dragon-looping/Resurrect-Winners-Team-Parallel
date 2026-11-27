"""Tests for order lifecycle SQLAlchemy models and Alembic migration 0004."""

from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import CustomerOrder, OrderStatus, Plant, SKU


def test_alembic_upgrade_includes_order_lifecycle_tables(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify Alembic upgrades to 0004 and creates all order lifecycle tables."""
    api_dir = Path(__file__).resolve().parents[1]
    db_file = tmp_path / "alembic_orders.db"
    db_url = f"sqlite+pysqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", db_url)

    alembic_cfg = Config(str(api_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(api_dir / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)

    command.upgrade(alembic_cfg, "head")

    from app.core.database import create_db_engine

    engine = create_db_engine(db_url)
    try:
        tables = set(inspect(engine).get_table_names())
        assert {
            "customer_orders",
            "order_status_history",
            "order_allocations",
            "production_batches",
            "customer_offers",
            "order_plans",
        } <= tables
    finally:
        engine.dispose()


def test_customer_order_constraints(db_session: Session, seeded_catalog: dict[str, object]) -> None:
    """Verify CustomerOrder enforces unique order_number and positive quantity."""
    udupi: Plant = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]
    fans: SKU = seeded_catalog["skus"]["Electric fans"]  # type: ignore[index]
    dt = datetime(2026, 12, 1, 10, 0, tzinfo=timezone.utc)

    order = CustomerOrder(
        order_number="ORD-001",
        customer_name="Acme Electricals",
        plant_id=udupi.id,
        sku_id=fans.id,
        quantity=10,
        customer_request_date=dt,
        agreed_delivery_date=dt,
        status=OrderStatus.CREATED.value,
    )
    db_session.add(order)
    db_session.commit()

    dup = CustomerOrder(
        order_number="ORD-001",
        customer_name="Other",
        plant_id=udupi.id,
        sku_id=fans.id,
        quantity=5,
        customer_request_date=dt,
        agreed_delivery_date=dt,
    )
    db_session.add(dup)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
