from fastapi import APIRouter
from typing import Annotated
import uuid
from fastapi import HTTPException, Query, status
from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.modules.platform_administration.dependencies import (
    PlatformAdministrationServiceDep,
    PlatformUserAdministrationServiceDep,
)
from app.modules.platform_administration.exceptions import (
    OrganizationHasMembersError,
    OrganizationMembershipAlreadyExistsError,
    OrganizationNameAlreadyExistsError,
    OrganizationNotFoundError,
    OrganizationSlugAlreadyExistsError,
    PlatformUserNotFoundError,
)
from app.modules.platform_administration.filters import (
    OrganizationListParams,
    OrganizationMemberListParams,
)
from app.modules.platform_administration.schemas.platform_organizations_schemas import (
    CreateOrganizationRequest,
    OrganizationResponse,
    OrganizationListItemResponse,
    OrganizationMemberResponse,
    UpdateOrganizationRequest,
)
from app.modules.platform_administration.schemas.platform_users_schemas import (
    AddOrganizationMemberRequest,
)

from app.modules.platform_administration.routers.users_router import (
    update_user_organization_access,
)

router = APIRouter()


@router.get(
    "/organizations",
    response_model=PagePaginatedResponse[OrganizationListItemResponse],
)
async def get_paginated_organizations(
    params: Annotated[
        OrganizationListParams,
        Query(),
    ],
    service: PlatformAdministrationServiceDep,
) -> PagePaginatedResponse[OrganizationListItemResponse]:
    organizations, total = await service.get_organizations(
        filters=params,
        pagination=params,
    )

    member_counts = await service.get_member_counts(organizations)

    total_pages = (
        total + params.page_size - 1
    ) // params.page_size

    return PagePaginatedResponse(
        items=[
            OrganizationListItemResponse(
                **OrganizationResponse.model_validate(organization).model_dump(),
                members_count=member_counts.get(organization.id, 0),
            )
            for organization in organizations
        ],
        pagination=PagePaginationMeta(
            page=params.page,
            page_size=params.page_size,
            total=total,
            total_pages=total_pages,
        ),
    )


@router.post(
    "/organizations",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_organization(
    payload: CreateOrganizationRequest,
    service: PlatformAdministrationServiceDep,
) -> OrganizationResponse:
    """Create an organization.

    Requires a platform administrator session and a valid CSRF token.
    """
    try:
        organization = await service.create_organization(
            payload,
        )
    except OrganizationSlugAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization slug already exists",
        ) from None
    except OrganizationNameAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization name already exists",
        ) from None

    return OrganizationResponse.model_validate(
        organization,
    )


@router.get(
    "/organizations/{organization_id}",
    response_model=OrganizationResponse,
    status_code=status.HTTP_200_OK,
)
async def get_organization(
    organization_id: uuid.UUID,
    service: PlatformAdministrationServiceDep,
) -> OrganizationResponse:
    """Return a single organization."""
    try:
        organization = await service.get_organization_by_id(
            organization_id=organization_id,
        )
    except OrganizationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        ) from None

    return OrganizationResponse.model_validate(
        organization,
    )


@router.patch(
    "/organizations/{organization_id}",
    response_model=OrganizationResponse,
    status_code=status.HTTP_200_OK,
)
async def update_organization(
    organization_id: uuid.UUID,
    payload: UpdateOrganizationRequest,
    service: PlatformAdministrationServiceDep,
) -> OrganizationResponse:
    """Update only the provided organization fields that actually changed."""
    try:
        organization = await service.update_organization(
            organization_id=organization_id,
            payload=payload,
        )
    except OrganizationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        ) from None
    except OrganizationNameAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization name already exists",
        ) from None
    except OrganizationSlugAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization slug already exists",
        ) from None

    return OrganizationResponse.model_validate(
        organization,
    )


@router.delete(
    "/organizations/{organization_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_organization(
    organization_id: uuid.UUID,
    service: PlatformAdministrationServiceDep,
) -> None:
    """Delete an organization only when it has no memberships."""
    try:
        await service.delete_organization(
            organization_id=organization_id,
        )
    except OrganizationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        ) from None
    except OrganizationHasMembersError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization cannot be deleted while it has members",
        ) from None


@router.get(
    "/organizations/{organization_id}/members",
    response_model=PagePaginatedResponse[OrganizationMemberResponse],
)
async def get_paginated_organization_members(
    organization_id: uuid.UUID,
    params: Annotated[OrganizationMemberListParams, Query()],
    service: PlatformAdministrationServiceDep,
) -> PagePaginatedResponse[OrganizationMemberResponse]:
    """Return all memberships, including suspended accounts and accesses."""
    try:
        members, total = await service.get_members(
            organization_id, search=params.search, pagination=params,
        )
    except OrganizationNotFoundError:
        raise HTTPException(status_code=404, detail="Organization not found") from None
    return PagePaginatedResponse(
        items=[OrganizationMemberResponse(
            user_id=user.id, email=user.email, user_is_active=user.is_active,
            user_is_verified=user.is_verified, is_superuser=user.is_superuser,
            role=membership.role.value, membership_is_active=membership.is_active,
        ) for user, membership in members],
        pagination=PagePaginationMeta(
            page=params.page, page_size=params.page_size, total=total,
            total_pages=(total + params.page_size - 1) // params.page_size,
        ),
    )


@router.post(
    "/organizations/{organization_id}/members",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def create_organization_member(
    organization_id: uuid.UUID,
    payload: AddOrganizationMemberRequest,
    service: PlatformUserAdministrationServiceDep,
) -> None:
    """Add an existing platform user to an organization."""
    try:
        await service.add_to_organization(
            user_id=payload.user_id,
            organization_id=organization_id,
            role=payload.role,
        )
    except PlatformUserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        ) from None
    except OrganizationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        ) from None
    except OrganizationMembershipAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already belongs to this organization",
        ) from None


# Keep both public membership paths on the same validated implementation.
router.add_api_route(
    "/organizations/{organization_id}/members/{user_id}",
    update_user_organization_access,
    methods=["PATCH"],
    status_code=status.HTTP_204_NO_CONTENT,
    name="update_organization_member",
)
