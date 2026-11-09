from fastapi import APIRouter
from typing import Annotated
import uuid
from fastapi import HTTPException, Query, status
from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.modules.authorisation.dependencies import PlatformAdmin
from app.modules.platform_administration.dependencies import (
    PlatformUserAdministrationServiceDep,
)
from app.modules.platform_administration.exceptions import (
    OrganizationMembershipNotFoundError,
    OrganizationNotFoundError,
    PlatformUserNotFoundError,
    UserAlreadyVerifiedError,
    UserEmailAlreadyExistsError,
    UserNotVerifiedError,
)
from app.modules.platform_administration.schemas.platform_users_schemas import (
    CreatePlatformUserRequest,
    CreatePlatformUserResponse,
    EmailDispatchResponse,
    PlatformUserListParams,
    PlatformUserResponse,
    UpdateOrganizationAccessRequest,
    UpdatePlatformUserRequest,
)

router = APIRouter()


@router.get(
    "/users",
    response_model=PagePaginatedResponse[PlatformUserResponse],
)
async def get_paginated_users(
    params: Annotated[PlatformUserListParams, Query()],
    service: PlatformUserAdministrationServiceDep,
) -> PagePaginatedResponse[PlatformUserResponse]:
    users, total = await service.get_users(params)
    total_pages = (total + params.page_size - 1) // params.page_size

    return PagePaginatedResponse(
        items=[service.to_response(user) for user in users],
        pagination=PagePaginationMeta(
            page=params.page,
            page_size=params.page_size,
            total=total,
            total_pages=total_pages,
        ),
    )


@router.post(
    "/users",
    response_model=CreatePlatformUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_platform_user(
    payload: CreatePlatformUserRequest,
    service: PlatformUserAdministrationServiceDep,
    admin: PlatformAdmin,
) -> CreatePlatformUserResponse:
    try:
        user, invitation_queued = await service.create_user(
            payload,
            triggered_by_user_id=admin.id,
        )
    except UserEmailAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        ) from None
    except OrganizationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        ) from None

    return CreatePlatformUserResponse(
        user=service.to_response(user),
        invitation_queued=invitation_queued,
    )


@router.patch(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def update_platform_user(
    user_id: uuid.UUID,
    payload: UpdatePlatformUserRequest,
    service: PlatformUserAdministrationServiceDep,
) -> None:
    try:
        await service.set_user_active(
            user_id=user_id,
            is_active=payload.is_active,
        )
    except PlatformUserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        ) from None


@router.patch(
    "/users/{user_id}/organizations/{organization_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def update_user_organization_access(
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    payload: UpdateOrganizationAccessRequest,
    service: PlatformUserAdministrationServiceDep,
) -> None:
    try:
        await service.set_organization_access(
            user_id=user_id,
            organization_id=organization_id,
            is_active=payload.is_active,
            role=payload.role,
        )
    except PlatformUserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        ) from None
    except OrganizationMembershipNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization membership not found",
        ) from None


@router.post(
    "/users/{user_id}/verification-email",
    response_model=EmailDispatchResponse,
)
async def resend_user_verification_email(
    user_id: uuid.UUID,
    service: PlatformUserAdministrationServiceDep,
    admin: PlatformAdmin,
) -> EmailDispatchResponse:
    try:
        queued = await service.resend_verification_email(
            user_id=user_id,
            triggered_by_user_id=admin.id,
        )
    except PlatformUserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        ) from None
    except UserAlreadyVerifiedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already verified",
        ) from None
    return EmailDispatchResponse(queued=queued)


@router.post(
    "/users/{user_id}/password-reset-email",
    response_model=EmailDispatchResponse,
)
async def send_user_password_reset_email(
    user_id: uuid.UUID,
    service: PlatformUserAdministrationServiceDep,
    admin: PlatformAdmin,
) -> EmailDispatchResponse:
    try:
        queued = await service.send_password_reset_email(
            user_id=user_id,
            triggered_by_user_id=admin.id,
        )
    except PlatformUserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        ) from None
    except UserNotVerifiedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User must verify their account first",
        ) from None
    return EmailDispatchResponse(queued=queued)
