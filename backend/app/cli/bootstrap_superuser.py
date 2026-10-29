# app/cli/bootstrap_superuser.py

import asyncio
from getpass import getpass

from fastapi_users import exceptions
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.schemas import BaseUserCreate
from pydantic import ValidationError
from sqlalchemy import select

from app.db.session import async_session_factory, engine
from app.models.user import User
from app.modules.auth.services.user_manager import UserManager


async def bootstrap_superuser() -> int:
    email = input("Email: ").strip()

    password = getpass("Password: ")
    password_confirmation = getpass("Confirm password: ")

    if password != password_confirmation:
        print("Passwords do not match.")
        return 1

    async with async_session_factory() as session:
        existing_superuser_id = await session.scalar(
            select(User.id)
            .where(User.is_superuser.is_(True))
            .limit(1)
        )

        if existing_superuser_id is not None:
            print(
                "A platform superuser already exists. "
                "Bootstrap aborted."
            )
            return 1

        user_db = SQLAlchemyUserDatabase(
            session,
            User,
        )

        user_manager = UserManager(user_db)

        try:
            user_create = BaseUserCreate(
                email=email,
                password=password,
                is_active=True,
                is_superuser=True,
                is_verified=True,
            )

            user = await user_manager.create(
                user_create,
                safe=False,
            )

        except ValidationError as exc:
            print(f"Invalid user data: {exc}")
            return 1

        except exceptions.InvalidPasswordException as exc:
            print(f"Invalid password: {exc.reason}")
            return 1

        except exceptions.UserAlreadyExists:
            print("A user with this email already exists.")
            return 1

    print("Platform superuser created successfully.")
    print(f"ID: {user.id}")
    print(f"Email: {user.email}")

    return 0


async def async_main() -> int:
    try:
        return await bootstrap_superuser()
    finally:
        await engine.dispose()


def main() -> None:
    raise SystemExit(
        asyncio.run(async_main())
    )


if __name__ == "__main__":
    main()