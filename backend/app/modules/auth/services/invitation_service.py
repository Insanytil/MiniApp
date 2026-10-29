from datetime import UTC, datetime

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_secret
from app.models.user_invitation import UserInvitation
from app.modules.auth.exceptions import InvalidInvitationError
from app.modules.auth.repository.invitation_repository import UserInvitationRepository
from app.modules.auth.services.user_manager import UserManager


class InvitationService:
    def __init__(
        self,
        *,
        db: AsyncSession,
        repository: UserInvitationRepository,
        user_manager: UserManager,
    ):
        self.db = db
        self.repository = repository
        self.user_manager = user_manager

    async def get_valid_invitation(
        self,
        *,
        token: str,
        for_update: bool = False,
    ) -> UserInvitation:
        invitation = await self.repository.get_by_token_hash(
            token_hash=hash_secret(token),
            for_update=for_update,
        )

        if (
            invitation is None
            or invitation.used_at is not None
            or invitation.expires_at <= datetime.now(UTC)
        ):
            raise InvalidInvitationError()

        return invitation

    async def accept(self, *, token: str, password: str) -> None:
        invitation = await self.get_valid_invitation(
            token=token,
            for_update=True,
        )
        user = invitation.user

        await self.user_manager.validate_password(password, user)
        user.hashed_password = self.user_manager.password_helper.hash(password)
        user.is_verified = True
        invitation.used_at = datetime.now(UTC)

        try:
            await self.db.commit()
        except SQLAlchemyError:
            await self.db.rollback()
            raise