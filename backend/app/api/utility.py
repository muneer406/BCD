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

    # Verify session belongs to user
    session = get_session(session_id, user.id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Get image record
    try:
        images_response = supabase.table("images").select(
            "storage_path"
        ).eq("session_id", session_id).eq("image_type", image_type).maybeSingle().execute()

        image = images_response.data
        if not image or not image.get("storage_path"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Image not found for angle: {image_type}",
            )

        # Generate signed URL
        signed_url_response = supabase.storage.from_("bcd-images").create_signed_url(
            image["storage_path"], 3600
        )

        if not signed_url_response or not signed_url_response.get("signedUrl"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate preview URL",
            )

        return {
            "preview_url": signed_url_response["signedUrl"],
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

    try:
        # Get session
        session = get_session(session_id, user.id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )

        # Count total user sessions
        count_response = supabase.table("sessions").select(
            "id", count="exact", head=True
        ).eq("user_id", user.id).execute()

        total_sessions = count_response.count or 0
        is_first_session = total_sessions <= 1

        # Get most recent session to check if current is latest
        latest_response = supabase.table("sessions").select(
            "id"
        ).eq("user_id", user.id).order("created_at", ascending=False).limit(1).maybeSingle().execute()

        latest_session = latest_response.data
        is_current = latest_session and latest_session.get("id") == session_id

        return {
            "session_id": session_id,
            "is_first_session": is_first_session,
            "is_current": is_current,
            "total_sessions": total_sessions,
            "created_at": session.get("created_at"),
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

    try:
        # Verify session belongs to user
        session = get_session(session_id, user.id)
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

                if signed_url_response and signed_url_response.get("signedUrl"):
                    thumbnails[image_type] = signed_url_response["signedUrl"]
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
