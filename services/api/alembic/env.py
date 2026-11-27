"""Alembic migration environment connected to SETUVYUHA SQLAlchemy metadata."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool

from app import models  # noqa: F401
from app.core.config import get_settings
from app.core.database import Base, create_db_engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_database_url() -> str:
    """Resolve the database URL from Alembic config override or application settings."""
    configured_url = config.get_main_option("sqlalchemy.url")
    if configured_url:
        return configured_url
    get_settings.cache_clear()
    return get_settings().database_url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode without creating a live DB connection."""
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url.startswith("sqlite"),
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using the configured database engine."""
    url = get_database_url()
    connectable = config.attributes.get("connection")

    if connectable is None:
        engine = create_db_engine(url)
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=url.startswith("sqlite"),
            )
            with context.begin_transaction():
                context.run_migrations()
        engine.dispose()
    else:
        context.configure(
            connection=connectable,
            target_metadata=target_metadata,
            render_as_batch=str(connectable.engine.url).startswith("sqlite"),
            poolclass=pool.NullPool,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
