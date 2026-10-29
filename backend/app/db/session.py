# app/db/session.y
from collections.abc import AsyncGenerator
from typing import Annotated
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings


engine = create_async_engine(
    settings.database_url,
    echo=False,
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            # No commit here because transaction boundaries are handled
            # explicitly within services for finer-grained control.
        except Exception:
            # Defensive rollback in case an exception propagates outside
            # the service / business process.
            await session.rollback()
            raise



        # SQLAlchemy session operations:
        #
        # add(obj)
        #   Adds the object to the SQLAlchemy session.
        #   No SQL statement is necessarily sent to PostgreSQL immediately.
        #
        # flush()
        #   Sends pending changes to PostgreSQL without committing the transaction.
        #   Useful for retrieving database-generated values, such as an ID,
        #   while still keeping the possibility of rolling back the transaction.
        #
        # commit()
        #   Permanently commits the current transaction.
        #   With expire_on_commit=False, already loaded attributes remain available
        #   in memory after the commit.
        #
        # refresh(obj)
        #   Explicitly reloads the object from PostgreSQL using a SELECT query.
        #   Useful when the database may have generated or modified values
        #   server-side (triggers, computed values, some server defaults, etc.).
        #   It is not required after every commit.
        #
        # rollback()
        #   Cancels all uncommitted changes in the current transaction.
        #   It also restores the session to a usable state after certain
        #   SQLAlchemy or PostgreSQL errors.
        #
        # close()
        #   Releases the resources used by the session.
        #   When using "async with async_session_factory() as session",
        #   the session is automatically closed when leaving the context block.
