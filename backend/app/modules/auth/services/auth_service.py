from dataclasses import dataclass
from datetime import datetime, timedelta, UTC

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    generate_secret,
    hash_secret,
    session_expiry,
)
from app.modules.auth.repository.session_repository import AuthSessionRepository
from app.modules.auth.services.user_manager import UserManager
from app.models.auth_session import AuthSession
from app.models.user import User

from app.modules.auth.exceptions import (
    InvalidCredentialsError,
    InvalidSessionError,
)



@dataclass(frozen=True, slots=True)
class AuthenticatedSession:
    session: AuthSession
    user: User


@dataclass(frozen=True, slots=True)
class LoginResult:
    session_token: str
    csrf_token: str
    expires_at: datetime


class AuthService:
    def __init__(
        self,
        db: AsyncSession,
        user_manager: UserManager,
        session_repository: AuthSessionRepository,
        session_lifetime: timedelta,
    ):
        self.db = db
        self.user_manager = user_manager
        self.session_repository = session_repository
        self.session_lifetime = session_lifetime

    async def login(
        self,
        *,
        email: str,
        password: str,
    ) -> LoginResult:
        user = await self.user_manager.authenticate_email_password(
            email=email,
            password=password,
        )

        if user is None or not user.is_active or not user.is_verified:
            raise InvalidCredentialsError()

        session_token = generate_secret()
        csrf_token = generate_secret()

        expires_at = session_expiry(
            self.session_lifetime,
        )

        await self.session_repository.create(
            user_id=user.id,
            token_hash=hash_secret(session_token),
            csrf_token_hash=hash_secret(csrf_token),
            expires_at=expires_at,
        )

        await self.db.commit()

        return LoginResult(
            session_token=session_token,
            csrf_token=csrf_token,
            expires_at=expires_at,
        )

    async def authenticate_session(
            self,
            session_token: str,
    ) -> AuthenticatedSession:
        token_hash = hash_secret(session_token)

        auth_session = await self.session_repository.get_by_token_hash(
            token_hash,
        )

        if auth_session is None:
            raise InvalidSessionError()

        now = datetime.now(UTC)

        if auth_session.expires_at <= now:
            raise InvalidSessionError()

        if not auth_session.user.is_active:
            raise InvalidSessionError()

        return AuthenticatedSession(
            session=auth_session,
            user=auth_session.user,
        )
    async def logout(
            self,
            authenticated_session: AuthenticatedSession,
    ) -> None:
        await self.session_repository.delete(
            authenticated_session.session,
        )

        await self.db.commit()

    async def logout_all(
            self,
            user: User,
    ) -> None:
        await self.session_repository.delete_all_for_user(
            user.id,
        )

        await self.db.commit()