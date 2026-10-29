import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.modules.auth.exceptions import InvalidDefaultOrganizationError


class AccountSettingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def set_default_organization(
        self,
        *,
        user: User,
        organization_id: uuid.UUID | None,
    ) -> None:
        if organization_id is not None and not any(
            membership.organization_id == organization_id
            and membership.is_active
            and membership.organization.is_active
            for membership in user.organization_memberships
        ):
            raise InvalidDefaultOrganizationError()

        user.default_organization_id = organization_id
        await self.db.commit()