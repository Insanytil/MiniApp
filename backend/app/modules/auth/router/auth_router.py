from fastapi import (
    APIRouter,
    HTTPException,
    Response,
    status,
)
from fastapi_users import exceptions as user_exceptions

from app.modules.auth.cookies import (
    clear_auth_cookies,
    set_auth_cookies,
)
from app.modules.auth.dependencies import (
    AccountSettingsServiceDep,
    AuthServiceDep,
    CsrfProtectedSession,
    CurrentUser,
    InvitationServiceDep,
    PasswordResetServiceDep,
)
from app.modules.auth.exceptions import (
    InvalidDefaultOrganizationError,
    InvalidCredentialsError,
    InvalidInvitationError,
    InvalidPasswordResetTokenError,
)
from app.modules.auth.schemas import (
    AcceptInvitationRequest,
    AcceptPasswordResetRequest,
    CurrentOrganizationResponse,
    CurrentUserResponse,
    InvitationResponse,
    LoginRequest,
    PasswordResetResponse,
    UpdateCurrentUserPreferencesRequest,
)


router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)


@router.post(
    "/login",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def login(
    payload: LoginRequest,
    response: Response,
    auth_service: AuthServiceDep,
) -> None:
    try:
        result = await auth_service.login(
            email=payload.email,
            password=payload.password,
        )
    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        ) from None

    set_auth_cookies(
        response,
        result,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout(
    response: Response,
    auth: CsrfProtectedSession,
    auth_service: AuthServiceDep
) -> None:
    await auth_service.logout(auth)

    clear_auth_cookies(response)


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout_all(
    response: Response,
    auth: CsrfProtectedSession,
    auth_service: AuthServiceDep,
) -> None:
    await auth_service.logout_all(
        auth.user,
    )

    clear_auth_cookies(response)


@router.get(
    "/me",
    response_model=CurrentUserResponse,
)
async def get_me(
    user: CurrentUser,
) -> CurrentUserResponse:
    organizations = [
        CurrentOrganizationResponse(
            id=membership.organization.id,
            name=membership.organization.name,
            slug=membership.organization.slug,
            role=membership.role,
        )
        for membership in sorted(
            user.organization_memberships,
            key=lambda item: item.organization.name.casefold(),
        )
        if membership.is_active and membership.organization.is_active
    ]
    available_organization_ids = {
        organization.id for organization in organizations
    }
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        is_superuser=user.is_superuser,
        is_verified=user.is_verified,
        default_organization_id=(
            user.default_organization_id
            if user.default_organization_id in available_organization_ids
            else None
        ),
        organizations=organizations,
    )


@router.patch(
    "/me/preferences",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def update_my_preferences(
    payload: UpdateCurrentUserPreferencesRequest,
    auth: CsrfProtectedSession,
    service: AccountSettingsServiceDep,
) -> None:
    try:
        await service.set_default_organization(
            user=auth.user,
            organization_id=payload.default_organization_id,
        )
    except InvalidDefaultOrganizationError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Default organization must be an active user membership",
        ) from None


@router.get(
    "/invitations/{token}",
    response_model=InvitationResponse,
)
async def get_invitation(
    token: str,
    service: InvitationServiceDep,
) -> InvitationResponse:
    try:
        invitation = await service.get_valid_invitation(token=token)
    except InvalidInvitationError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation is invalid or expired",
        ) from None
    return InvitationResponse(
        email=invitation.user.email,
        expires_at=invitation.expires_at,
    )


@router.post(
    "/invitations/accept",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def accept_invitation(
    payload: AcceptInvitationRequest,
    service: InvitationServiceDep,
) -> None:
    try:
        await service.accept(
            token=payload.token,
            password=payload.password,
        )
    except InvalidInvitationError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation is invalid or expired",
        ) from None
    except user_exceptions.InvalidPasswordException as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=exc.reason,
        ) from None


@router.get(
    "/password-resets/{token}",
    response_model=PasswordResetResponse,
)
async def get_password_reset(
    token: str,
    service: PasswordResetServiceDep,
) -> PasswordResetResponse:
    try:
        reset_token = await service.get_valid_token(token=token)
    except InvalidPasswordResetTokenError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Password reset link is invalid or expired",
        ) from None

    return PasswordResetResponse(
        email=reset_token.user.email,
        expires_at=reset_token.expires_at,
    )


@router.post(
    "/password-resets/accept",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def accept_password_reset(
    payload: AcceptPasswordResetRequest,
    service: PasswordResetServiceDep,
) -> None:
    try:
        await service.accept(token=payload.token, password=payload.password)
    except InvalidPasswordResetTokenError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Password reset link is invalid or expired",
        ) from None
    except user_exceptions.InvalidPasswordException as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=exc.reason,
        ) from None