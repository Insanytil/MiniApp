import uuid

from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import (
    BaseUserManager,
    UUIDIDMixin,
    exceptions,
)
from fastapi_users.schemas import BaseUserCreate

from app.models.user import User


MIN_PASSWORD_LENGTH = 15


class UserManager(
    UUIDIDMixin,
    BaseUserManager[User, uuid.UUID],
):
    async def validate_password(
        self,
        password: str,
        user: BaseUserCreate | User,
    ) -> None:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise exceptions.InvalidPasswordException(
                reason=f"Password must contain at least {MIN_PASSWORD_LENGTH} characters.",
            )

    async def authenticate_email_password(
        self,
        *,
        email: str,
        password: str,
    ) -> User | None:
        credentials = OAuth2PasswordRequestForm(
            username=email.strip(),
            password=password,
        )

        return await self.authenticate(credentials)