import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.base import Base
# Register every mapped model before Alembic reads the metadata.
from app.models.auth_session import AuthSession  # noqa: F401
from app.models.entity_type import EntityType  # noqa: F401
from app.models.entity_record import EntityRecord, EntityRecordLink  # noqa: F401
from app.models.background_job import BackgroundJob  # noqa: F401
from app.models.organization import Organization  # noqa: F401
from app.models.organization_membership import OrganizationMembership  # noqa: F401
from app.models.password_reset_token import PasswordResetToken  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.user_invitation import UserInvitation  # noqa: F401


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Generate SQL without connecting to PostgreSQL."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # Pass the URL object directly, preserving special characters in passwords.
    connectable = create_async_engine(
        settings.database_url,
        poolclass=pool.NullPool,
    )
    try:
        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)
    finally:
        await connectable.dispose()


def run_migrations_online() -> None:
    """Run Alembic through SQLAlchemy's asyncpg engine."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
