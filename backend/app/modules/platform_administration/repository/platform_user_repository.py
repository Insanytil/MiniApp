import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.organization_membership import OrganizationMembership
from app.models.organization_role import OrganizationRole
from app.models.user import User


class PlatformUserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_email(self, *, email: str) -> User | None:
        return await self.db.scalar(
            select(User).where(func.lower(User.email) == email.lower())
        )

    async def get_by_id_with_memberships(self, *, user_id: uuid.UUID) -> User:
        user = await self.db.scalar(
            select(User)
            .options(
                selectinload(User.organization_memberships).joinedload(
                    OrganizationMembership.organization
                )
            )
            .where(User.id == user_id)
        )
        if user is None:
            raise RuntimeError("Created user could not be reloaded")
        return user

    async def get_managed_by_id(
        self,
        *,
        user_id: uuid.UUID,
        for_update: bool = False,
    ) -> User | None:
        statement = select(User).where(
            User.id == user_id,
            User.is_superuser.is_(False),
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.db.scalar(statement)

    async def get_membership(
        self,
        *,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> OrganizationMembership | None:
        return await self.db.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.organization_id == organization_id,
            )
        )

    async def create(self, *, email: str, hashed_password: str) -> User:
        user = User(
            email=email,
            hashed_password=hashed_password,
            is_active=True,
            is_superuser=False,
            is_verified=False,
        )
        self.db.add(user)
        await self.db.flush()
        return user

    async def create_membership(
        self,
        *,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
        role: OrganizationRole,
    ) -> OrganizationMembership:
        membership = OrganizationMembership(
            user_id=user_id,
            organization_id=organization_id,
            role=role,
        )
        self.db.add(membership)
        await self.db.flush()
        return membership

    async def get_paginated(
        self,
        *,
        search: str | None,
        organization_id: uuid.UUID | None,
        is_active: bool | None,
        offset: int,
        limit: int,
    ) -> list[User]:
        statement = select(User).where(User.is_superuser.is_(False))
        if search and search.strip():
            term = search.strip().lower()
            statement = statement.where(
                func.lower(User.email).contains(term, autoescape=True)
            )
        if organization_id is not None:
            statement = statement.where(
                User.organization_memberships.any(
                    OrganizationMembership.organization_id == organization_id
                )
            )
        if is_active is not None:
            statement = statement.where(User.is_active.is_(is_active))

        statement = (
            statement
            .options(
                selectinload(User.organization_memberships).joinedload(
                    OrganizationMembership.organization
                )
            )
            .order_by(User.email.asc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.scalars(statement)
        return list(result.unique().all())

    async def count_filtered(
        self,
        *,
        search: str | None,
        organization_id: uuid.UUID | None,
        is_active: bool | None,
    ) -> int:
        statement = select(func.count()).select_from(User).where(
            User.is_superuser.is_(False)
        )
        if search and search.strip():
            statement = statement.where(
                func.lower(User.email).contains(
                    search.strip().lower(),
                    autoescape=True,
                )
            )
        if organization_id is not None:
            statement = statement.where(
                User.organization_memberships.any(
                    OrganizationMembership.organization_id == organization_id
                )
            )
        if is_active is not None:
            statement = statement.where(User.is_active.is_(is_active))
        return await self.db.scalar(statement) or 0