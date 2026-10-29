from datetime import UTC, datetime

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_secret
from app.models.password_reset_token import PasswordResetToken
from app.modules.auth.exceptions import InvalidPasswordResetTokenError
from app.modules.auth.repository.password_reset_repository import PasswordResetTokenRepository
from app.modules.auth.repository.session_repository import AuthSessionRepository
from app.modules.auth.services.user_manager import UserManager


class PasswordResetService:
    def __init__(
        self,
        *,
        db: AsyncSession,
        repository: PasswordResetTokenRepository,
        session_repository: AuthSessionRepository,
        user_manager: UserManager,
    ):
        self.db = db
        self.repository = repository
        self.session_repository = session_repository
        self.user_manager = user_manager

    async def get_valid_token(
        self,
        *,
        token: str,
        for_update: bool = False,
    ) -> PasswordResetToken:
        reset_token = await self.repository.get_by_token_hash(
            token_hash=hash_secret(token),
            for_update=for_update,
        )
        if (
            reset_token is None
            or reset_token.used_at is not None
            or reset_token.expires_at <= datetime.now(UTC)
        ):
            raise InvalidPasswordResetTokenError()

        return reset_token

    async def accept(self, *, token: str, password: str) -> None:
        reset_token = await self.get_valid_token(
            token=token,
            for_update=True,
        )
        user = reset_token.user
        await self.user_manager.validate_password(password, user)
        user.hashed_password = self.user_manager.password_helper.hash(password)
        reset_token.used_at = datetime.now(UTC)
        await self.session_repository.delete_all_for_user(user.id)

        try:
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise