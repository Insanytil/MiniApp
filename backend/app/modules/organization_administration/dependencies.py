from typing import Annotated

from fastapi import Depends

from app.modules.organization_administration.repository import OrganizationUserRepository
from app.modules.organization_administration.service import OrganizationUserService
from app.modules.platform_administration.dependencies import PlatformUserAdministrationServiceDep


async def get_organization_user_service(users: PlatformUserAdministrationServiceDep) -> OrganizationUserService:
    return OrganizationUserService(
        db=users.db, repository=OrganizationUserRepository(users.db),
        user_creation=users, job_service=users.job_service,
    )


OrganizationUserServiceDep = Annotated[OrganizationUserService, Depends(get_organization_user_service)]
