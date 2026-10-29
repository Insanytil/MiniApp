# app/modules/auth/session_repository.py

import uuid
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.auth_session import AuthSession
from app.models.organization_membership import OrganizationMembership
from app.models.user import User


class AuthSessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        user_id: uuid.UUID,
        token_hash: bytes,
        csrf_token_hash: bytes,
        expires_at: datetime,
    ) -> AuthSession:
        auth_session = AuthSession(
            user_id=user_id,
            token_hash=token_hash,
            csrf_token_hash=csrf_token_hash,
            expires_at=expires_at,
        )

        self.db.add(auth_session)

        # Execute the pending INSERT without committing the transaction.
        # This allows database constraints to fail immediately while still
        # leaving the transaction under the service layer's control.
        await self.db.flush()

        return auth_session

    async def get_by_token_hash(
        self,
        token_hash: bytes,
    ) -> AuthSession | None:
        statement = (
            select(AuthSession)
            .options(
                joinedload(AuthSession.user)
                .selectinload(User.organization_memberships)
                .joinedload(OrganizationMembership.organization),
            )
            .where(
                AuthSession.token_hash == token_hash,
            )
        )

        return await self.db.scalar(statement)

    async def delete(
        self,
        auth_session: AuthSession,
    ) -> None:
        await self.db.delete(auth_session)

    async def delete_all_for_user(
        self,
        user_id: uuid.UUID,
    ) -> None:
        await self.db.execute(
            delete(AuthSession).where(
                AuthSession.user_id == user_id,
            )
        )

    async def delete_expired(
        self,
        *,
        now: datetime,
    ) -> None:
        await self.db.execute(
            delete(AuthSession).where(
                AuthSession.expires_at <= now,
            )
        )