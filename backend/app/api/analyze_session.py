from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from ..dependencies import get_current_user
from ..services.analysis_service import analyze_session as run_analysis
from ..services.db import get_supabase_client
from ..services.image_service import get_session_images
from ..services.session_service import get_session

router = APIRouter(tags=["analysis"])


def _persist_analysis(session_id: str, user_id: str, analysis: dict) -> bool:
    supabase = get_supabase_client()
    existing = (
        supabase.table("session_analysis")
        .select("id")
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    )
    overwritten = bool(existing.data)
    supabase.table("angle_analysis").delete().eq(
        "session_id", session_id).execute()
    supabase.table("session_analysis").delete().eq(
        "session_id", session_id).execute()

    per_angle_rows = [
        {
            "session_id": session_id,
            "user_id": user_id,
            "angle_type": item["angle_type"],
            "change_score": item["change_score"],
            "summary": item["summary"],
        }
        for item in analysis["per_angle"]
    ]
    if per_angle_rows:
        supabase.table("angle_analysis").insert(per_angle_rows).execute()

    session_row = {
        "session_id": session_id,
        "user_id": user_id,
        "overall_change_score": analysis["scores"].get("overall_change_score", 0.0),
    }
    supabase.table("session_analysis").insert(session_row).execute()

    return overwritten


def _process_and_store(session_id: str, user_id: str, images: list) -> None:
    analysis = run_analysis(images, user_id, session_id)
    _persist_analysis(session_id, user_id, analysis)


@router.post("/analyze-session/{session_id}")
def analyze_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    async_process: bool = False,
    user=Depends(get_current_user),
):
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

    if session.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is not completed",
        )

    images = get_session_images(session_id, user_id)
    required_types = {"front", "left", "right", "up", "down", "raised"}
    present_types = {image.get("image_type") for image in images}
    missing = required_types - present_types

    # Allow analysis with partial images (at least 3 angles)
    if len(present_types) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Need at least 3 angles. Found: {', '.join(sorted(present_types))} (missing: {', '.join(sorted(missing))})",
        )

    if async_process:
        background_tasks.add_task(
            _process_and_store, session_id, user_id, images)
        return {
            "success": True,
            "data": {
                "session_id": session_id,
                "status": "processing",
            },
        }

    analysis = run_analysis(images, user_id, session_id)
    overwritten = _persist_analysis(session_id, user_id, analysis)

    return {
        "success": True,
        "data": {
            "session_id": session_id,
            "overwritten": overwritten,
            "session_analysis": {
                "per_angle": analysis["per_angle"],
                "overall_summary": analysis["overall_summary"],
            },
            "scores": {
                "change_score": analysis["scores"].get("overall_change_score", 0.0),
                "confidence": 0.85,
            },
        },
    }
