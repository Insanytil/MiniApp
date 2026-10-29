import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_secret
from app.models.background_job import BackgroundJobType
from app.models.organization_role import OrganizationRole
from app.models.user import User
from app.modules.auth.services.user_manager import UserManager
from app.modules.jobs.services.jobs_service import BackgroundJobService
from app.modules.platform_administration.exceptions import (
    OrganizationNotFoundError,
    OrganizationMembershipAlreadyExistsError,
    OrganizationMembershipNotFoundError,
    PlatformUserNotFoundError,
    UserAlreadyVerifiedError,
    UserEmailAlreadyExistsError,
    UserNotVerifiedError,
)
from app.modules.platform_administration.repository.platform_administration_repository import OrganizationRepository
from app.modules.platform_administration.repository.platform_user_repository import PlatformUserRepository
from app.modules.platform_administration.schemas.platform_users_schemas import (
    CreatePlatformUserRequest,
    PlatformUserListParams,
    PlatformUserResponse,
    UserMembershipResponse,
)


class PlatformUserAdministrationService:
    def __init__(
        self,
        *,
        db: AsyncSession,
        user_repository: PlatformUserRepository,
        organization_repository: OrganizationRepository,
        job_service: BackgroundJobService,
        user_manager: UserManager,
    ):
        self.db = db
        self.user_repository = user_repository
        self.organization_repository = organization_repository
        self.job_service = job_service
        self.user_manager = user_manager

    async def create_user(
        self,
        payload: CreatePlatformUserRequest,
        triggered_by_user_id: uuid.UUID,
    ) -> tuple[User, bool]:
        if await self.user_repository.get_by_email(email=payload.email):
            raise UserEmailAlreadyExistsError()

        if payload.organization_id is not None:
            organization = await self.organization_repository.get_by_id(
                organization_id=payload.organization_id,
            )
            if organization is None:
                raise OrganizationNotFoundError()

        placeholder_password = generate_secret()

        try:
            user = await self.user_repository.create(
                email=payload.email,
                hashed_password=self.user_manager.password_helper.hash(
                    placeholder_password
                ),
            )

            if payload.organization_id is not None and payload.role is not None:
                await self.user_repository.create_membership(
                    user_id=user.id,
                    organization_id=payload.organization_id,
                    role=payload.role,
                )

            job = self.job_service.create_email_job(
                job_type=BackgroundJobType.ACCOUNT_VERIFICATION_EMAIL,
                recipient_email=user.email,
                subject_user_id=user.id,
                organization_id=payload.organization_id,
                triggered_by_user_id=triggered_by_user_id,
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            if "email" in str(exc.orig).lower():
                raise UserEmailAlreadyExistsError() from None
            raise

        user = await self.user_repository.get_by_id_with_memberships(
            user_id=user.id,
        )
        invitation_queued = await self.job_service.dispatch(job)

        return user, invitation_queued

    async def get_users(
        self,
        params: PlatformUserListParams,
    ) -> tuple[list[User], int]:
        users = await self.user_repository.get_paginated(
            search=params.search,
            organization_id=params.organization_id,
            is_active=params.is_active,
            offset=params.offset,
            limit=params.page_size,
        )
        total = await self.user_repository.count_filtered(
            search=params.search,
            organization_id=params.organization_id,
            is_active=params.is_active,
        )
        return users, total

    async def set_user_active(
        self,
        *,
        user_id: uuid.UUID,
        is_active: bool,
    ) -> None:
        user = await self._get_managed_user(user_id=user_id)
        user.is_active = is_active
        await self.db.commit()

    async def set_organization_access(
        self,
        *,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
        is_active: bool | None,
        role: OrganizationRole | None,
    ) -> None:
        if await self.user_repository.get_managed_by_id(user_id=user_id) is None:
            raise PlatformUserNotFoundError()
        membership = await self.user_repository.get_membership(
            user_id=user_id,
            organization_id=organization_id,
        )
        if membership is None:
            raise OrganizationMembershipNotFoundError()
        if is_active is not None:
            membership.is_active = is_active
        if role is not None:
            membership.role = role
        await self.db.commit()

    async def add_to_organization(
        self,
        *,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
        role: OrganizationRole,
    ) -> None:
        await self._get_managed_user(user_id=user_id)
        organization = await self.organization_repository.get_by_id(
            organization_id=organization_id,
        )
        if organization is None:
            raise OrganizationNotFoundError()
        if await self.user_repository.get_membership(
            user_id=user_id,
            organization_id=organization_id,
        ) is not None:
            raise OrganizationMembershipAlreadyExistsError()

        try:
            await self.user_repository.create_membership(
                user_id=user_id,
                organization_id=organization_id,
                role=role,
            )
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise OrganizationMembershipAlreadyExistsError() from None

    async def resend_verification_email(
        self,
        *,
        user_id: uuid.UUID,
        triggered_by_user_id: uuid.UUID,
    ) -> bool:
        user = await self._get_managed_user(user_id=user_id, for_update=True)
        if user.is_verified:
            raise UserAlreadyVerifiedError()

        job = self.job_service.create_email_job(
            job_type=BackgroundJobType.ACCOUNT_VERIFICATION_EMAIL,
            recipient_email=user.email,
            subject_user_id=user.id,
            organization_id=None,
            triggered_by_user_id=triggered_by_user_id,
        )
        await self.db.flush()
        await self.db.commit()
        return await self.job_service.dispatch(job)

    async def send_password_reset_email(
        self,
        *,
        user_id: uuid.UUID,
        triggered_by_user_id: uuid.UUID,
    ) -> bool:
        user = await self._get_managed_user(user_id=user_id, for_update=True)
        if not user.is_verified:
            raise UserNotVerifiedError()

        job = self.job_service.create_email_job(
            job_type=BackgroundJobType.PASSWORD_RESET_EMAIL,
            recipient_email=user.email,
            subject_user_id=user.id,
            organization_id=None,
            triggered_by_user_id=triggered_by_user_id,
        )
        await self.db.flush()
        await self.db.commit()
        return await self.job_service.dispatch(job)

    async def _get_managed_user(
        self,
        *,
        user_id: uuid.UUID,
        for_update: bool = False,
    ) -> User:
        user = await self.user_repository.get_managed_by_id(
            user_id=user_id,
            for_update=for_update,
        )
        if user is None:
            raise PlatformUserNotFoundError()
        return user

    @staticmethod
    def to_response(user: User) -> PlatformUserResponse:
        return PlatformUserResponse(
            id=user.id,
            email=user.email,
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at,
            memberships=[
                UserMembershipResponse(
                    organization_id=membership.organization_id,
                    organization_name=membership.organization.name,
                    organization_slug=membership.organization.slug,
                    organization_is_active=membership.organization.is_active,
                    role=OrganizationRole(membership.role),
                    is_active=membership.is_active,
                )
                for membership in sorted(
                    user.organization_memberships,
                    key=lambda item: item.organization.name.casefold(),
                )
            ],
        )