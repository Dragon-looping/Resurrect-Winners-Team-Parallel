"""Tests for godown recovery ORM models and Alembic migration 0005."""

from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import create_db_engine
from app.models import Plant, RecoveryRoute


def test_alembic_upgrade_includes_godown_recovery_tables(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify Alembic upgrades to 0005 and creates recovery tables."""
    api_dir = Path(__file__).resolve().parents[1]
    db_file = tmp_path / "alembic_recovery.db"
    db_url = f"sqlite+pysqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", db_url)

    alembic_cfg = Config(str(api_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(api_dir / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)

    command.upgrade(alembic_cfg, "head")

    engine = create_db_engine(db_url)
    try:
        tables = set(inspect(engine).get_table_names())
        assert {"recovery_routes", "recovery_plans", "recovery_audit_logs"} <= tables
    finally:
        engine.dispose()


def test_recovery_route_unique_constraint(db_session: Session, seeded_catalog: dict[str, object]) -> None:
    """Verify RecoveryRoute enforces unique (from_plant_id, to_plant_id)."""
    mangaluru: Plant = seeded_catalog["plants"]["Mangaluru"]  # type: ignore[index]
    udupi: Plant = seeded_catalog["plants"]["Udupi"]  # type: ignore[index]

    r1 = RecoveryRoute(
        from_plant_id=mangaluru.id,
        to_plant_id=udupi.id,
        transit_hours=2,
        truck_cutoff_hour_utc=16,
        freight_cost_per_unit=15.0,
        fixed_dispatch_cost=200.0,
    )
    db_session.add(r1)
    db_session.commit()

    r2 = RecoveryRoute(
        from_plant_id=mangaluru.id,
        to_plant_id=udupi.id,
        transit_hours=3,
    )
    db_session.add(r2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
