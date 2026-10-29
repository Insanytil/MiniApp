from fastapi import Response

from app.core.config import settings
from app.modules.auth.services.auth_service import LoginResult


def set_auth_cookies(
    response: Response,
    login_result: LoginResult,
) -> None:
    response.set_cookie(
        key=settings.auth_session_cookie_name,
        value=login_result.session_token,
        expires=login_result.expires_at,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )

    response.set_cookie(
        key=settings.auth_csrf_cookie_name,
        value=login_result.csrf_token,
        expires=login_result.expires_at,
        httponly=False,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )

def clear_auth_cookies(
    response: Response,
) -> None:
    response.delete_cookie(
        key=settings.auth_session_cookie_name,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite="lax",
    )

    response.delete_cookie(
        key=settings.auth_csrf_cookie_name,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=False,
        samesite="lax",
    )