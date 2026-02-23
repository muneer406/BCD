from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from ..dependencies import get_current_user
from ..limiter import limiter
from ..processing.quality import variation_level
from ..services.analysis_fetch_service import get_session_analysis as fetch_cached_analysis
from ..services.analysis_service import analyze_session as run_analysis
from ..services.db import get_supabase_client
from ..services.image_service import get_session_images
from ..services.session_service import get_session

router = APIRouter(tags=["analysis"])

# ---------------------------------------------------------------------------
# In-process async job status registry (Part 6)
# Map session_id → {"status": "processing"|"completed"|"failed", "error": str|None}
# ---------------------------------------------------------------------------
_analysis_jobs: dict = {}


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
            # Phase 5: angle quality score (graceful fallback if column missing)
            "angle_quality_score": item.get("angle_quality_score"),
        }
        for item in analysis["per_angle"]
    ]
    if per_angle_rows:
        try:
            supabase.table("angle_analysis").insert(per_angle_rows).execute()
        except Exception:
            # angle_quality_score column may not exist — retry without it
            for row in per_angle_rows:
                row.pop("angle_quality_score", None)
            supabase.table("angle_analysis").insert(per_angle_rows).execute()

    scores = analysis.get("scores", {})
    quality_summary = analysis.get("image_quality_summary", {})
    session_row = {
        "session_id": session_id,
        "user_id": user_id,
        "overall_change_score": scores.get("overall_change_score", 0.0),
        "trend_score": scores.get("trend_score"),
        # Phase 5 columns
        "analysis_confidence_score": scores.get("analysis_confidence_score"),
        "session_quality_score": quality_summary.get("session_quality_score"),
    }
    try:
        supabase.table("session_analysis").insert(session_row).execute()
    except Exception:
        # Phase 5 columns may not exist yet — retry with Phase 4 subset
        try:
            fallback_row = {k: v for k, v in session_row.items()
                            if k in ("session_id", "user_id", "overall_change_score", "trend_score")}
            supabase.table("session_analysis").insert(fallback_row).execute()
        except Exception:
            # trend_score column also missing — bare minimum insert
            bare_row = {
                "session_id": session_id,
                "user_id": user_id,
                "overall_change_score": scores.get("overall_change_score", 0.0),
            }
            supabase.table("session_analysis").insert(bare_row).execute()

    return overwritten


def _process_and_store(session_id: str, user_id: str, images: list) -> None:
    """Background task: run analysis, persist results, update job registry."""
    try:
        _analysis_jobs[session_id] = {"status": "processing", "error": None}
        analysis = run_analysis(images, user_id, session_id)
        _persist_analysis(session_id, user_id, analysis)
        _analysis_jobs[session_id] = {"status": "completed", "error": None}
    except Exception as exc:
        _analysis_jobs[session_id] = {"status": "failed", "error": str(exc)}


@router.post("/analyze-session/{session_id}")
@limiter.limit("20/day")
def analyze_session(
    session_id: str,
    request: Request,
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
        _analysis_jobs[session_id] = {"status": "processing", "error": None}
        background_tasks.add_task(
            _process_and_store, session_id, user_id, images)
        return {
            "success": True,
            "data": {
                "session_id": session_id,
                "status": "processing",
            },
        }

    # ── Return cached result if analysis already exists (skip re-run) ────────
    # Pass ?force=true to bypass the cache and re-run the full ML pipeline.
    force = request.query_params.get("force", "").lower() == "true"
    if not force:
        cached = fetch_cached_analysis(session_id, user_id)
        if cached and cached.get("per_angle"):
            overall_score = float(cached.get("overall_change_score") or 0.0)
            trend = cached.get("trend_score")
            # Infer first-session: overall score == 0 and no trend score
            is_first = overall_score == 0.0 and trend is None
            per_angle_with_levels = [
                {
                    **row,
                    "variation_level": variation_level(float(row.get("change_score") or 0.0)),
                }
                for row in cached["per_angle"]
            ]
            return {
                "success": True,
                "data": {
                    "session_id": session_id,
                    "overwritten": False,
                    "from_cache": True,
                    "is_first_session": is_first,
                    "session_analysis": {
                        "per_angle": per_angle_with_levels,
                        "overall_summary": (
                            "Baseline established. Future sessions will be compared to this."
                            if is_first
                            else "ML analysis complete. Scores reflect distance from your personal baseline."
                        ),
                    },
                    "scores": {
                        "change_score": overall_score,
                        "variation_level": variation_level(overall_score),
                        "trend_score": float(trend) if trend is not None else None,
                    },
                },
            }

    analysis = run_analysis(images, user_id, session_id)
    overwritten = _persist_analysis(session_id, user_id, analysis)

    scores = analysis.get("scores", {})
    quality_summary = analysis.get("image_quality_summary", {})
    return {
        "success": True,
        "data": {
            "session_id": session_id,
            "overwritten": overwritten,
            "is_first_session": scores.get("is_first_session", False),
            "session_analysis": {
                "per_angle": analysis["per_angle"],
                "overall_summary": analysis["overall_summary"],
            },
            "scores": {
                "change_score": scores.get("overall_change_score", 0.0),
                "variation_level": scores.get("variation_level"),
                "trend_score": scores.get("trend_score"),
                "analysis_confidence_score": scores.get("analysis_confidence_score"),
                "session_quality_score": scores.get("session_quality_score"),
            },
            # Part 7: trust and transparency fields
            "image_quality_summary": quality_summary,
            "baseline_used": analysis.get("baseline_used"),
            "comparison_layers_used": analysis.get("comparison_layers_used", []),
            "processing_time_ms": analysis.get("processing_time_ms"),
        },
    }
