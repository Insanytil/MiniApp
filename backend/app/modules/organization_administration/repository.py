import uuid

from sqlalchemy import String, func, select, type_coerce
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization_membership import OrganizationMembership
from app.models.user import User


class OrganizationUserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _members(organization_id: uuid.UUID):
        return (
            select(User, OrganizationMembership)
            .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
            .where(
                OrganizationMembership.organization_id == organization_id,
                User.is_superuser.is_(False),
            )
        )

    async def list_members(
        self, *, organization_id: uuid.UUID, search: str | None,
        offset: int, limit: int,
    ) -> tuple[list[tuple[User, OrganizationMembership]], int]:
        statement = self._members(organization_id)
        if search and search.strip():
            statement = statement.where(
                type_coerce(func.lower(User.email), String).contains(
                    search.strip().lower(), autoescape=True,
                )
            )
        total = await self.db.scalar(select(func.count()).select_from(statement.subquery()))
        rows = await self.db.execute(
            statement.order_by(User.email, User.id).offset(offset).limit(limit)
        )
        return [(user, membership) for user, membership in rows.all()], total or 0

    async def get_member(
        self, *, organization_id: uuid.UUID, user_id: uuid.UUID,
        for_update: bool = False,
    ) -> tuple[User, OrganizationMembership] | None:
        statement = self._members(organization_id).where(User.id == user_id)
        if for_update:
            statement = statement.with_for_update()
        row = (await self.db.execute(statement)).one_or_none()
        return (row[0], row[1]) if row is not None else None
