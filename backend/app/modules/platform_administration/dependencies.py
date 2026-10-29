from typing import Annotated
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.modules.auth.dependencies import get_user_manager
from app.modules.auth.services.user_manager import UserManager
from app.modules.jobs.repository.jobs_repository import BackgroundJobRepository
from app.modules.jobs.services.jobs_service import BackgroundJobService
from app.modules.platform_administration.repository.platform_administration_repository import (
    OrganizationRepository,
)
from app.modules.platform_administration.services.platform_organization_services import (
    PlatformAdministrationService,
)
from app.modules.platform_administration.repository.platform_user_repository import PlatformUserRepository
from app.modules.platform_administration.services.platform_user_services import PlatformUserAdministrationService


async def get_platform_administration_service(
    session: AsyncSession = Depends(get_async_session),
) -> PlatformAdministrationService:
    return PlatformAdministrationService(
        db=session,
        organization_repository=OrganizationRepository(session),
    )

PlatformAdministrationServiceDep = Annotated[
    PlatformAdministrationService,
    Depends(get_platform_administration_service),
]


async def get_platform_user_administration_service(
    session: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
) -> PlatformUserAdministrationService:
    return PlatformUserAdministrationService(
        db=session,
        user_repository=PlatformUserRepository(session),
        organization_repository=OrganizationRepository(session),
        job_service=BackgroundJobService(
            session,
            BackgroundJobRepository(session),
        ),
        user_manager=user_manager,
    )


PlatformUserAdministrationServiceDep = Annotated[
    PlatformUserAdministrationService,
    Depends(get_platform_user_administration_service),
]