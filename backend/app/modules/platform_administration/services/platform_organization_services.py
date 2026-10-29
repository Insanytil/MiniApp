import uuid

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PagePaginationParams
from app.models.organization import Organization
from app.models.user import User
from app.models.organization_membership import OrganizationMembership
from app.modules.platform_administration.exceptions import (
    OrganizationHasMembersError,
    OrganizationNameAlreadyExistsError,
    OrganizationNotFoundError,
    OrganizationSlugAlreadyExistsError,
)
from app.modules.platform_administration.filters import OrganizationFilters
from app.modules.platform_administration.repository.platform_administration_repository import (
   OrganizationRepository,
)
from app.modules.platform_administration.schemas.platform_organizations_schemas import (
    CreateOrganizationRequest,
    UpdateOrganizationRequest,
)


class PlatformAdministrationService:
    def __init__(
        self,
        db: AsyncSession,
        organization_repository: OrganizationRepository,
    ):
        self.db = db
        self.organization_repository = organization_repository

    async def create_organization(
        self,
        payload: CreateOrganizationRequest,
    ) -> Organization:
        existing_name = await self.organization_repository.get_by_name(
            name=payload.name,
        )

        if existing_name is not None:
            raise OrganizationNameAlreadyExistsError()

        existing_slug = await self.organization_repository.get_by_slug(
            slug=payload.slug,
        )

        if existing_slug is not None:
            raise OrganizationSlugAlreadyExistsError()

        try:
            organization = await self.organization_repository.create(
                name=payload.name,
                slug=payload.slug,
            )

            await self.db.commit()

            return organization

        except IntegrityError as exc:
            await self.db.rollback()
            self._raise_organization_integrity_error(exc)
            raise

    async def get_organizations(
        self,
        *,
        filters: OrganizationFilters,
        pagination: PagePaginationParams,
    ) -> tuple[list[Organization], int]:
        organizations = await self.organization_repository.get_paginated(
            filters=filters,
            offset=pagination.offset,
            limit=pagination.page_size,
        )

        total = await self.organization_repository.count_filtered(
            filters,
        )

        return organizations, total

    async def get_member_counts(
        self, organizations: list[Organization],
    ) -> dict[uuid.UUID, int]:
        return await self.organization_repository.count_members([org.id for org in organizations])

    async def get_members(
        self, organization_id: uuid.UUID, *, search: str | None,
        pagination: PagePaginationParams,
    ) -> tuple[list[tuple[User, OrganizationMembership]], int]:
        await self.get_organization_by_id(organization_id=organization_id)
        return await self.organization_repository.get_members(
            organization_id, search=search, offset=pagination.offset,
            limit=pagination.page_size,
        )

    async def get_organization_by_id(
        self,
        *,
        organization_id: uuid.UUID,
    ) -> Organization:
        organization = await self.organization_repository.get_by_id(
            organization_id=organization_id,
        )

        if organization is None:
            raise OrganizationNotFoundError()

        return organization

    async def update_organization(
        self,
        *,
        organization_id: uuid.UUID,
        payload: UpdateOrganizationRequest,
    ) -> Organization:
        organization = await self.organization_repository.get_by_id(
            organization_id=organization_id,
        )

        if organization is None:
            raise OrganizationNotFoundError()

        updates = payload.model_dump(
            exclude_unset=True,
        )

        changes = {
            field: value
            for field, value in updates.items()
            if getattr(organization, field) != value
        }

        if not changes:
            return organization

        if "name" in changes:
            existing_name = await self.organization_repository.get_by_name(
                name=changes["name"],
            )

            if (
                existing_name is not None
                and existing_name.id != organization.id
            ):
                raise OrganizationNameAlreadyExistsError()

        if "slug" in changes:
            existing_slug = await self.organization_repository.get_by_slug(
                slug=changes["slug"],
            )

            if (
                existing_slug is not None
                and existing_slug.id != organization.id
            ):
                raise OrganizationSlugAlreadyExistsError()

        for field, value in changes.items():
            setattr(organization, field, value)

        try:
            await self.db.commit()
            await self.db.refresh(organization)

            return organization

        except IntegrityError as exc:
            await self.db.rollback()
            self._raise_organization_integrity_error(exc)
            raise

    async def delete_organization(
        self,
        *,
        organization_id: uuid.UUID,
    ) -> None:
        organization = await self.organization_repository.get_by_id(
            organization_id=organization_id,
        )

        if organization is None:
            raise OrganizationNotFoundError()

        if await self.organization_repository.has_members(
            organization_id=organization_id,
        ):
            raise OrganizationHasMembersError()

        try:
            await self.organization_repository.delete(
                organization=organization,
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()

            driver_error = getattr(
                exc.orig,
                "__cause__",
                None,
            ) or exc.orig

            if getattr(driver_error, "constraint_name", None) == (
                "fk_organization_memberships_organization_id_organizations"
            ):
                raise OrganizationHasMembersError() from None

            raise
        except SQLAlchemyError:
            await self.db.rollback()
            raise

    @staticmethod
    def _raise_organization_integrity_error(
        exc: IntegrityError,
    ) -> None:
        driver_error = getattr(
            exc.orig,
            "__cause__",
            None,
        ) or exc.orig

        constraint_name = getattr(
            driver_error,
            "constraint_name",
            None,
        )

        if constraint_name == "uq_organizations_slug":
            raise OrganizationSlugAlreadyExistsError() from None

        if constraint_name == "uq_organizations_name_normalized":
            raise OrganizationNameAlreadyExistsError() from None