from typing import Dict, List

from .db import get_supabase_client


def get_session_analysis(session_id: str, user_id: str) -> Dict[str, object]:
    supabase = get_supabase_client()

    session_result = (
        supabase.table("session_analysis")
        .select("overall_change_score, trend_score, created_at")
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

    return {
        "session_id": session_id,
        "overall_change_score": session_rows[0].get("overall_change_score", 0.0),
        "trend_score": session_rows[0].get("trend_score"),
        "created_at": session_rows[0].get("created_at"),
        "per_angle": angle_rows,
    }
