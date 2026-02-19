"""
BCD Backend - analyze_status.py
Phase 5 Part 6: GET /api/analyze-status/{session_id}

Returns the current processing status for a session analysis:
  - "processing"  — background job is in progress
  - "completed"   — analysis row exists in session_analysis table
  - "failed"      — background job threw an exception
  - "not_started" — no job registered and no analysis row found
"""

from fastapi import APIRouter, Depends, HTTPException, status

from ..api.analyze_session import _analysis_jobs
from ..dependencies import get_current_user
from ..services.db import get_supabase_client
from ..services.session_service import get_session

router = APIRouter(tags=["analysis"])


@router.get("/analyze-status/{session_id}")
def get_analyze_status(
    session_id: str,
    user=Depends(get_current_user),
):
    """
    Return the analysis status for a session.

    Checks (in order):
    1. In-memory job registry (set by async_process=true flows).
    2. session_analysis table — if a row exists the job completed previously.
    3. Session existence — returns 404 if session not found or not owned.
    """
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user context",
        )

    session = get_session(session_id, user_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # 1. In-memory registry (most accurate for recently-queued jobs)
    job = _analysis_jobs.get(session_id)
    if job:
        return {
            "success": True,
            "data": {
                "session_id": session_id,
                "status": job["status"],
                "error": job.get("error"),
            },
        }

    # 2. Check DB for a completed analysis row
    supabase = get_supabase_client()
    result = (
        supabase.table("session_analysis")
        .select("id")
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    )

    if result.data:
        return {
            "success": True,
            "data": {
                "session_id": session_id,
                "status": "completed",
                "error": None,
            },
        }

    # 3. No record anywhere
    return {
        "success": True,
        "data": {
            "session_id": session_id,
            "status": "not_started",
            "error": None,
        },
    }
