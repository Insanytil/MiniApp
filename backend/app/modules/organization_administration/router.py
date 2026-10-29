import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.modules.authorisation.dependencies import OrganizationAdminScope
from app.modules.organization_administration.dependencies import OrganizationUserServiceDep
from app.modules.organization_administration.schemas import (
    CreateOrganizationUserRequest, CreateOrganizationUserResponse,
    OrganizationUserListParams, OrganizationUserResponse,
    UpdateOrganizationUserAccessRequest,
)
from app.modules.organization_administration.service import SelfSuspensionError
from app.modules.platform_administration.exceptions import (
    OrganizationMembershipNotFoundError, OrganizationNotFoundError,
    UserEmailAlreadyExistsError, UserNotVerifiedError,
)
from app.modules.platform_administration.schemas.platform_users_schemas import EmailDispatchResponse

router = APIRouter(prefix="/organization/users", tags=["organization administration"])


@router.get("", response_model=PagePaginatedResponse[OrganizationUserResponse])
async def list_users(
    params: Annotated[OrganizationUserListParams, Query()],
    scope: OrganizationAdminScope,
    service: OrganizationUserServiceDep,
) -> PagePaginatedResponse[OrganizationUserResponse]:
    users, total = await service.list_users(organization_id=scope.organization.id, params=params)
    return PagePaginatedResponse(
        items=users, pagination=PagePaginationMeta(
            page=params.page, page_size=params.page_size, total=total,
            total_pages=(total + params.page_size - 1) // params.page_size,
        ),
    )


@router.post("", response_model=CreateOrganizationUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: CreateOrganizationUserRequest,
    scope: OrganizationAdminScope, service: OrganizationUserServiceDep,
) -> CreateOrganizationUserResponse:
    try:
        user, queued = await service.create_user(
            organization_id=scope.organization.id, actor_id=scope.user.id, payload=payload,
        )
    except UserEmailAlreadyExistsError:
        raise HTTPException(status_code=409, detail="A user with this email already exists") from None
    except OrganizationNotFoundError:
        raise HTTPException(status_code=404, detail="Organization not found") from None
    return CreateOrganizationUserResponse(user=user, invitation_queued=queued)


@router.patch("/{user_id}/access", status_code=status.HTTP_204_NO_CONTENT)
async def update_access(
    user_id: uuid.UUID, payload: UpdateOrganizationUserAccessRequest,
    scope: OrganizationAdminScope, service: OrganizationUserServiceDep,
) -> None:
    try:
        await service.set_access(
            organization_id=scope.organization.id, actor_id=scope.user.id,
            user_id=user_id, is_active=payload.is_active,
        )
    except OrganizationMembershipNotFoundError:
        raise HTTPException(status_code=404, detail="Organization membership not found") from None
    except SelfSuspensionError:
        raise HTTPException(status_code=409, detail="You cannot suspend your own organization access") from None


@router.post("/{user_id}/password-reset-email", response_model=EmailDispatchResponse)
async def send_password_reset(
    user_id: uuid.UUID,
    scope: OrganizationAdminScope, service: OrganizationUserServiceDep,
) -> EmailDispatchResponse:
    try:
        queued = await service.send_password_reset(
            organization_id=scope.organization.id, actor_id=scope.user.id, user_id=user_id,
        )
    except OrganizationMembershipNotFoundError:
        raise HTTPException(status_code=404, detail="Organization membership not found") from None
    except UserNotVerifiedError:
        raise HTTPException(status_code=409, detail="User account must be activated first") from None
    return EmailDispatchResponse(queued=queued)
