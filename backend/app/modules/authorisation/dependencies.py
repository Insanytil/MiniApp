import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.session import get_async_session
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.organization_role import OrganizationRole
from app.models.user import User
from app.modules.auth.dependencies import (
    CsrfProtectedSession,
    EventAuthenticatedSessionDep,
)
from app.modules.auth.services.auth_service import AuthenticatedSession


async def require_platform_admin(
    auth: CsrfProtectedSession,
) -> User:
    """
    Platform admin dependency.

    Ensures that the current authenticated user has platform administrator access.

    Raises:
        HTTPException: 403 Forbidden if the user is not a platform administrator.

    Returns:
        User: The resolved platform administrator user.
    """
    if not auth.user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform administrator access required",
        )

    return auth.user


PlatformAdmin = Annotated[
    User,
    Depends(require_platform_admin),
]
"""
Annotated dependency for platform administrator access.

Platform admin dependency.

Ensures that the current authenticated user has platform administrator access.

Raises:
    HTTPException: 403 Forbidden if the user is not a platform administrator.

Returns:
    User: The resolved platform administrator user.
"""


@dataclass(frozen=True, slots=True)
class OrganizationScope:
    organization: Organization
    user: User
    role: OrganizationRole | None


async def _resolve_organization_scope(
    organization_id: uuid.UUID,
    auth: AuthenticatedSession,
    session: AsyncSession,
) -> OrganizationScope:
    organization = await session.scalar(
        select(Organization).where(
            Organization.id == organization_id,
            Organization.is_active.is_(True),
        )
    )
    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    if auth.user.is_superuser:
        return OrganizationScope(
            organization=organization,
            user=auth.user,
            role=None,
        )

    membership = await session.scalar(
        select(OrganizationMembership)
        .options(joinedload(OrganizationMembership.organization))
        .where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == auth.user.id,
            OrganizationMembership.is_active.is_(True),
        )
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active organization membership required",
        )

    return OrganizationScope(
        organization=membership.organization,
        user=auth.user,
        role=membership.role,
    )


async def require_organization_scope(
    organization_id: Annotated[
        uuid.UUID,
        Header(alias="X-Organization-ID"),
    ],
    auth: CsrfProtectedSession,
    session: AsyncSession = Depends(get_async_session),
) -> OrganizationScope:
    return await _resolve_organization_scope(organization_id, auth, session)


async def require_organization_event_scope(
    organization_id: Annotated[uuid.UUID, Query()],
    auth: EventAuthenticatedSessionDep,
    session: AsyncSession = Depends(get_async_session, scope="function"),
) -> OrganizationScope:
    return await _resolve_organization_scope(organization_id, auth, session)


CurrentOrganizationScope = Annotated[
    OrganizationScope,
    Depends(require_organization_scope),
]


async def require_organization_admin(
    scope: CurrentOrganizationScope,
) -> OrganizationScope:
    if scope.role != OrganizationRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization administrator access required",
        )
    return scope



OrganizationAdminScope = Annotated[
    OrganizationScope,
    Depends(require_organization_admin),
]
"""Organization scope requiring administrator privileges.

Ensures that the current authenticated user has administrator access
to the requested organization.

Raises:
    HTTPException: 403 Forbidden if the user is not an organization administrator.

Returns:
    OrganizationScope: The resolved organization scope.
"""


async def require_organization_event_admin(
    scope: OrganizationScope = Depends(require_organization_event_scope),
) -> OrganizationScope:
    if scope.role != OrganizationRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization administrator access required",
        )
    return scope


OrganizationAdminEventScope = Annotated[
    OrganizationScope,
    Depends(require_organization_event_admin, scope="function"),
]


async def require_platform_event_admin(
    auth: EventAuthenticatedSessionDep,
) -> User:
    if not auth.user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform administrator access required",
        )
    return auth.user


PlatformEventAdmin = Annotated[
    User,
    Depends(require_platform_event_admin, scope="function"),
]