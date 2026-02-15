from typing import Dict

from fastapi import Header, HTTPException, status

from .config import get_settings
from .utils.security import decode_supabase_jwt


def get_current_user(authorization: str | None = Header(default=None)) -> Dict[str, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing JWT token",
        )

    settings = get_settings()
    if not settings.supabase_jwks_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWKS_URL is not configured",
        )

    try:
        return decode_supabase_jwt(
            token,
            jwks_url=settings.supabase_jwks_url,
            algorithm=settings.jwt_algorithm,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc


def get_app_settings():
    return get_settings()
