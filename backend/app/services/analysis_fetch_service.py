from typing import Dict, List

from .db import get_supabase_client


def get_session_analysis(session_id: str, user_id: str) -> Dict[str, object]:
    supabase = get_supabase_client()

    session_result = (
        supabase.table("session_analysis")
        .select(
            "overall_change_score, trend_score, created_at, "
            "angle_aware_score, analysis_version, "
            "analysis_confidence_score, session_quality_score, localized_insights"
        )
        .eq("session_id", session_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    session_rows = session_result.data or []
    if not session_rows:
        return {}

    angle_result = (
        supabase.table("angle_analysis")
        .select("angle_type, change_score, summary, angle_quality_score")
        .eq("session_id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    angle_rows: List[Dict[str, object]] = angle_result.data or []

    row = session_rows[0]
    # Determine is_first_session safely (column may not exist or be None)
    is_first = row.get("is_first_session")
    if is_first is None:
        # Fall back to counting sessions
        all_sessions = (
            supabase.table("sessions")
            .select("id", count="exact", head=True)
            .eq("user_id", user_id)
            .execute()
        )
        is_first = int(getattr(all_sessions, "count", 0)) <= 1

    return {
        "session_id": session_id,
        "overall_change_score": row.get("overall_change_score", 0.0),
        "trend_score": row.get("trend_score"),
        "angle_aware_score": row.get("angle_aware_score"),
        "analysis_version": row.get("analysis_version"),
        "analysis_confidence_score": row.get("analysis_confidence_score"),
        "session_quality_score": row.get("session_quality_score"),
        "localized_insights": row.get("localized_insights"),
        "created_at": row.get("created_at"),
        "is_first_session": row.get("is_first_session"),
        "per_angle": angle_rows,
    }
