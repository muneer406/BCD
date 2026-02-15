from typing import Dict

from fastapi import Header, HTTPException, status

from .config import get_settings


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

    # TODO: Validate JWT using SUPABASE_JWT_PUBLIC_KEY
    # Placeholder response for skeleton scaffolding
    return {"user_id": "pending-validation"}


def get_app_settings():
    return get_settings()
