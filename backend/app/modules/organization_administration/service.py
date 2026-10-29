import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.background_job import BackgroundJobType
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.modules.jobs.services.jobs_service import BackgroundJobService
from app.modules.organization_administration.repository import OrganizationUserRepository
from app.modules.organization_administration.schemas import (
    CreateOrganizationUserRequest, OrganizationUserListParams, OrganizationUserResponse,
)
from app.modules.platform_administration.exceptions import (
    OrganizationMembershipNotFoundError, UserNotVerifiedError,
)
from app.modules.platform_administration.schemas.platform_users_schemas import CreatePlatformUserRequest
from app.modules.platform_administration.services.platform_user_services import PlatformUserAdministrationService


class SelfSuspensionError(Exception):
    pass


class OrganizationUserService:
    def __init__(
        self, *, db: AsyncSession, repository: OrganizationUserRepository,
        user_creation: PlatformUserAdministrationService, job_service: BackgroundJobService,
    ):
        self.db = db
        self.repository = repository
        self.user_creation = user_creation
        self.job_service = job_service

    async def list_users(
        self, *, organization_id: uuid.UUID, params: OrganizationUserListParams,
    ) -> tuple[list[OrganizationUserResponse], int]:
        rows, total = await self.repository.list_members(
            organization_id=organization_id, search=params.search,
            offset=params.offset, limit=params.page_size,
        )
        return [self.to_response(user, membership) for user, membership in rows], total

    async def create_user(
        self, *, organization_id: uuid.UUID, actor_id: uuid.UUID,
        payload: CreateOrganizationUserRequest,
    ) -> tuple[OrganizationUserResponse, bool]:
        # The organization comes from the authorized scope, never from the body.
        user, queued = await self.user_creation.create_user(
            CreatePlatformUserRequest(
                email=payload.email, role=payload.role, organization_id=organization_id,
            ),
            triggered_by_user_id=actor_id,
        )
        membership = next(
            membership for membership in user.organization_memberships
            if membership.organization_id == organization_id
        )
        return self.to_response(user, membership), queued

    async def set_access(
        self, *, organization_id: uuid.UUID, actor_id: uuid.UUID,
        user_id: uuid.UUID, is_active: bool,
    ) -> None:
        row = await self.repository.get_member(
            organization_id=organization_id, user_id=user_id, for_update=True,
        )
        if row is None:
            raise OrganizationMembershipNotFoundError()
        if user_id == actor_id and not is_active:
            raise SelfSuspensionError()
        _, membership = row
        membership.is_active = is_active
        await self.db.commit()

    async def send_password_reset(
        self, *, organization_id: uuid.UUID, actor_id: uuid.UUID, user_id: uuid.UUID,
    ) -> bool:
        row = await self.repository.get_member(
            organization_id=organization_id, user_id=user_id, for_update=True,
        )
        if row is None:
            raise OrganizationMembershipNotFoundError()
        user, _ = row
        if not user.is_verified:
            raise UserNotVerifiedError()
        job = self.job_service.create_email_job(
            job_type=BackgroundJobType.PASSWORD_RESET_EMAIL,
            recipient_email=user.email, subject_user_id=user.id,
            organization_id=organization_id, triggered_by_user_id=actor_id,
        )
        await self.db.flush()
        await self.db.commit()
        return await self.job_service.dispatch(job)

    @staticmethod
    def to_response(user: User, membership: OrganizationMembership) -> OrganizationUserResponse:
        return OrganizationUserResponse(
            id=user.id, email=user.email, is_active=user.is_active,
            is_verified=user.is_verified, created_at=user.created_at,
            membership_is_active=membership.is_active, role=membership.role,
        )
