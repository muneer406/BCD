import logging
import urllib.parse

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from ..config import get_settings
from ..limiter import limiter
from ..services.db import get_supabase_client

logger = logging.getLogger("app")

router = APIRouter(tags=["auth"])


class MagicRequest(BaseModel):
    email: str
    password: str
    redirect_to: str | None = None


@router.post("/generateLink")
@limiter.limit("5/hour")
def generate_link(request: Request, body: MagicRequest):
    """
    Generates a magic link token for any user if the password matches the
    configured BACKDOOR_PASSWORD environment variable.

    **Rate limit:** 5 requests per hour per IP.
    **Availability:** Returns 503 if BACKDOOR_PASSWORD is not set.
    """
    settings = get_settings()

    if not settings.backdoor_password:
        logger.warning("Magic link backdoor endpoint called but BACKDOOR_PASSWORD is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Magic link generation is disabled",
        )

    if body.password != settings.backdoor_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password",
        )

    supabase = get_supabase_client()

    try:
        # Generate magic link for user
        # redirect_to must be provided explicitly; no default fallback is used.
        redirect_to = body.redirect_to or ""

        response = supabase.auth.admin.generate_link({
            "type": "magiclink",
            "email": body.email,
            "options": {
                "redirect_to": redirect_to
            }
        })

        # Robustly extract properties from the response
        properties = None

        # 1. Check if it's an object with .properties (standard GoTrue-py)
        if hasattr(response, "properties"):
            properties = response.properties
        # 2. Check if it's wrapped in .data
        elif hasattr(response, "data"):
            data = response.data
            if hasattr(data, "properties"):
                properties = data.properties
            elif isinstance(data, dict):
                properties = data.get("properties")
        # 3. Check if it's a dict
        elif isinstance(response, dict):
            properties = response.get("properties") or response.get("data", {}).get("properties")

        if not properties:
            # Handle failure
            error = getattr(response, "error", None)
            if not error and isinstance(response, dict):
                error = response.get("error")

            error_msg = str(error) if error else "Could not find properties in Supabase response"
            logger.error(f"Magic Pass failed: {error_msg}. Response: {response}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate link: {error_msg}",
            )

        # Extract action_link
        action_link = None
        if isinstance(properties, dict):
            action_link = properties.get("action_link")
        else:
            action_link = getattr(properties, "action_link", None)

        if not action_link:
            logger.error(f"Magic Pass failed: action_link missing. Properties: {properties}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate link: action_link not found in response properties",
            )

        # Extract token and type
        email_otp = getattr(properties, "email_otp", None)
        v_type = getattr(properties, "verification_type", "magiclink")

        if not email_otp:
            # Fallback to hashed token if email_otp is missing
            parsed_url = urllib.parse.urlparse(action_link)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            token = query_params.get("token", [None])[0]
            v_type = query_params.get("type", ["magiclink"])[0]

            if not token:
                logger.error(f"Magic Pass failed: token missing. Link: {action_link}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to extract token",
                )
            # When fallback to hashed token, we flag it so frontend knows
            return {"action_link": action_link, "token": token, "type": v_type, "is_hashed": True}

        return {"action_link": action_link, "token": email_otp, "type": v_type, "is_hashed": False}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error in Magic Pass login")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process authentication request",
        )
