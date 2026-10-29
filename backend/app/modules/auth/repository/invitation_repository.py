import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user_invitation import UserInvitation


class UserInvitationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        user_id: uuid.UUID,
        token_hash: bytes,
        expires_at: datetime,
    ) -> UserInvitation:
        invitation = UserInvitation(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self.db.add(invitation)
        await self.db.flush()
        return invitation

    async def replace_for_user(
        self,
        *,
        user_id: uuid.UUID,
        token_hash: bytes,
        expires_at: datetime,
    ) -> UserInvitation:
        invitation = await self.db.scalar(
            select(UserInvitation).where(UserInvitation.user_id == user_id)
        )
        if invitation is None:
            invitation = UserInvitation(
                user_id=user_id,
                token_hash=token_hash,
                expires_at=expires_at,
                used_at=None,
            )
            self.db.add(invitation)
        else:
            invitation.token_hash = token_hash
            invitation.expires_at = expires_at
            invitation.used_at = None
        await self.db.flush()
        return invitation

    async def get_by_token_hash(
        self,
        *,
        token_hash: bytes,
        for_update: bool = False,
    ) -> UserInvitation | None:
        statement = (
            select(UserInvitation)
            .options(selectinload(UserInvitation.user))
            .where(UserInvitation.token_hash == token_hash)
        )
        if for_update:
            statement = statement.with_for_update()

        return await self.db.scalar(statement)