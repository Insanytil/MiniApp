import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.password_reset_token import PasswordResetToken


class PasswordResetTokenRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_or_replace(
        self,
        *,
        user_id: uuid.UUID,
        token_hash: bytes,
        expires_at: datetime,
    ) -> PasswordResetToken:
        reset_token = await self.db.scalar(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == user_id
            )
        )
        if reset_token is None:
            reset_token = PasswordResetToken(
                user_id=user_id,
                token_hash=token_hash,
                expires_at=expires_at,
                used_at=None,
            )
            self.db.add(reset_token)
        else:
            reset_token.token_hash = token_hash
            reset_token.expires_at = expires_at
            reset_token.used_at = None
        await self.db.flush()
        return reset_token

    async def get_by_token_hash(
        self,
        *,
        token_hash: bytes,
        for_update: bool = False,
    ) -> PasswordResetToken | None:
        statement = (
            select(PasswordResetToken)
            .options(selectinload(PasswordResetToken.user))
            .where(PasswordResetToken.token_hash == token_hash)
        )
        if for_update:
            statement = statement.with_for_update()

        return await self.db.scalar(statement)