"""
Utility API endpoints for image previews and session metadata.
These endpoints move image signing and session queries from frontend to backend.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies import get_current_user
from ..services.db import get_supabase_client
from ..services.session_service import get_session

router = APIRouter(tags=["utility"])


@router.get("/image-preview/{session_id}/{image_type}")
def get_image_preview(
    session_id: str,
    image_type: str,
    user=Depends(get_current_user),
):
    """
    Get a signed URL for an image preview.

    This moves the signed URL generation from frontend to backend for:
    - Security: URLs generated server-side
    - Simplicity: Frontend doesn't need storage client
    - Consistency: Single point for URL generation

    Args:
        session_id: Session UUID
        image_type: angle type (front, left, right, up, down, raised)
        user: Current authenticated user

    Returns:
        { "preview_url": "https://signed-url...", "expires_in": 3600 }
    """
    supabase = get_supabase_client()

    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user context",
        )

    # Verify session belongs to user
    session = get_session(session_id, user_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Get image record
    try:
        images_response = supabase.table("images").select(
            "storage_path"
        ).eq("session_id", session_id).eq("image_type", image_type).execute()

        images = images_response.data or []
        if not images:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Image not found for angle: {image_type}",
            )

        image = images[0]
        storage_path = image.get("storage_path") if isinstance(
            image, dict) else None

        if not storage_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Image storage path not found for angle: {image_type}",
            )

        # Generate signed URL
        signed_url_response = supabase.storage.from_("bcd-images").create_signed_url(
            storage_path, 3600
        )

        # Handle different response formats from Supabase storage client
        signed_url = None
        if isinstance(signed_url_response, dict):
            # Direct dict response
            signed_url = signed_url_response.get(
                "signedUrl") or signed_url_response.get("signedURL")
        elif hasattr(signed_url_response, "data"):
            # Wrapped in response object
            data = signed_url_response.data
            if isinstance(data, dict):
                signed_url = data.get("signedUrl") or data.get("signedURL")

        if not signed_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate preview URL",
            )

        return {
            "preview_url": signed_url,
            "expires_in": 3600,
            "image_type": image_type,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get image preview: {str(e)}",
        )


@router.get("/session-info/{session_id}")
def get_session_info(
    session_id: str,
    user=Depends(get_current_user),
):
    """
    Get session metadata including whether it's the user's first session.

    This moves session count queries from frontend to backend for:
    - Performance: Single query instead of separate count
    - Security: Backend validates session ownership
    - Simplicity: Frontend doesn't query DB directly

    Args:
        session_id: Session UUID
        user: Current authenticated user

    Returns:
        {
            "session_id": "uuid",
            "is_first_session": true,
            "total_sessions": 1,
            "created_at": "2026-02-16T...",
            "is_current": true
        }
    """
    supabase = get_supabase_client()

    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user context",
        )

    try:
        # Get session
        session = get_session(session_id, user_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )

        # Count total user sessions
        count_response = supabase.table("sessions").select(
            "id", count="exact", head=True
        ).eq("user_id", user_id).execute()

        total_sessions = count_response.count or 0

        # Get the oldest (first chronologically) session for this user
        oldest_response = supabase.table("sessions").select(
            "id"
        ).eq("user_id", user_id).order("created_at", desc=False).limit(1).execute()

        oldest_rows = oldest_response.data or []
        oldest_session = oldest_rows[0] if oldest_rows else None
        is_first_session = oldest_session and oldest_session.get(
            "id") == session_id

        # Get most recent session to check if current is latest
        latest_response = supabase.table("sessions").select(
            "id"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()

        latest_rows = latest_response.data or []
        latest_session = latest_rows[0] if latest_rows else None
        is_current = latest_session and latest_session.get("id") == session_id

        # Get previous session (second most recent) for comparisons
        previous_session_id = None
        if not is_first_session:
            all_sessions_response = supabase.table("sessions").select(
                "id"
            ).eq("user_id", user_id).order("created_at", desc=True).limit(2).execute()
            session_rows = all_sessions_response.data or []
            if len(session_rows) >= 2:
                previous_session_id = session_rows[1].get("id")

        return {
            "session_id": session_id,
            "is_first_session": is_first_session,
            "is_current": is_current,
            "total_sessions": total_sessions,
            "created_at": session.get("created_at"),
            "previous_session_id": previous_session_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get session info: {str(e)}",
        )


@router.get("/session-thumbnails/{session_id}")
def get_session_thumbnails(
    session_id: str,
    user=Depends(get_current_user),
):
    """
    Get all image previews for a session at once.

    More efficient than individual requests for showing all session images.

    Args:
        session_id: Session UUID
        user: Current authenticated user

    Returns:
        {
            "session_id": "uuid",
            "thumbnails": {
                "front": "https://signed-url...",
                "left": "https://signed-url...",
                ...
            }
        }
    """
    supabase = get_supabase_client()

    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user context",
        )

    try:
        # Verify session belongs to user
        session = get_session(session_id, user_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )

        # Get all images for session
        images_response = supabase.table("images").select(
            "image_type, storage_path"
        ).eq("session_id", session_id).execute()

        images = images_response.data or []
        thumbnails = {}

        # Generate signed URL for each image
        for image in images:
            image_type = image.get("image_type")
            storage_path = image.get("storage_path")

            if not image_type or not storage_path:
                continue

            try:
                signed_url_response = supabase.storage.from_("bcd-images").create_signed_url(
                    storage_path, 3600
                )

                # Handle different response formats
                signed_url = None
                if isinstance(signed_url_response, dict):
                    signed_url = signed_url_response.get(
                        "signedUrl") or signed_url_response.get("signedURL")
                elif hasattr(signed_url_response, "data"):
                    data = signed_url_response.data
                    if isinstance(data, dict):
                        signed_url = data.get(
                            "signedUrl") or data.get("signedURL")

                if signed_url:
                    thumbnails[image_type] = signed_url
            except Exception:
                # Skip images that fail to generate URLs
                pass

        return {
            "session_id": session_id,
            "thumbnails": thumbnails,
            "count": len(thumbnails),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get session thumbnails: {str(e)}",
        )
