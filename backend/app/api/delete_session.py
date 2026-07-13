"""
Session deletion endpoint — allows users to delete their own sessions.
Cleans up storage objects, then cascades to DB records via foreign keys.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies import get_current_user
from ..services.db import get_supabase_client
from ..services.session_service import get_session
from ..utils.validation import validate_session_id

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sessions"])


@router.delete("/delete-session/{session_id}")
def delete_session(
    session_id: str,
    user=Depends(get_current_user),
):
    """
    Delete a session and all associated data.

    Removes:
    - Storage objects (images)
    - Image records (cascaded via FK)
    - Angle analysis (cascaded)
    - Session analysis (cascaded)
    - Session record
    - Analysis logs
    - Embeddings (session, angle, region)

    Only the owning user can delete their own session.

    Known limitation: Supabase/CDN cached copies of deleted images may persist
    for a period after the underlying storage objects are removed. To fully
    invalidate cached images, either purge the CDN cache or wait for the cache
    TTL to expire in addition to this deletion.
    """
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user context",
        )

    err = validate_session_id(session_id)
    if err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=err,
        )

    # Verify session belongs to user
    session = get_session(session_id, user_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    supabase = get_supabase_client()

    try:
        # 1. Delete storage objects first
        images_result = (
            supabase.table("images")
            .select("storage_path")
            .eq("session_id", session_id)
            .execute()
        )
        storage_paths = [row["storage_path"] for row in (images_result.data or []) if row.get("storage_path")]

        if storage_paths:
            try:
                # Delete in batches of 100 (Supabase limit)
                for i in range(0, len(storage_paths), 100):
                    batch = storage_paths[i:i + 100]
                    # NOTE: storage.remove() deletes the current objects in the
                    # Supabase bucket, but cached copies served by the Supabase
                    # CDN (or any downstream CDN in front of the bucket) may
                    # continue to be available until the cache is purged or the
                    # TTL expires. This is a known limitation of the current
                    # deletion flow; full cache invalidation requires an
                    # explicit purge or waiting for TTL expiry.
                    supabase.storage.from_("bcd-images").remove(batch)
            except Exception as e:
                logger.warning("Storage cleanup partial failure for session %s: %s", session_id, e)

        # 2. Delete analysis_logs
        supabase.table("analysis_logs").delete().eq("session_id", session_id).execute()

        # 3. Delete embeddings (cascade doesn't cover these)
        for table in ("region_embeddings", "angle_embeddings", "session_embeddings"):
            try:
                supabase.table(table).delete().eq("session_id", session_id).execute()
            except Exception:
                pass  # Table may not exist yet

        # 4. Delete the session (cascades to images, angle_analysis, session_analysis)
        supabase.table("sessions").delete().eq("id", session_id).eq("user_id", user_id).execute()

        # 5. Clean up in-memory job registry if present
        from ..api.analyze_session import _analysis_jobs
        _analysis_jobs.pop(session_id, None)

        return {
            "success": True,
            "data": {
                "session_id": session_id,
                "deleted": True,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete session %s", session_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete session. Please try again.",
        )
