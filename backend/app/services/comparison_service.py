from typing import Dict, List

from .db import get_supabase_client


STABLE_THRESHOLD = 0.1
MILD_THRESHOLD = 0.25


def _load_angle_scores(session_id: str) -> Dict[str, float]:
    supabase = get_supabase_client()
    result = (
        supabase.table("angle_analysis")
        .select("angle_type, change_score")
        .eq("session_id", session_id)
        .execute()
    )
    rows = result.data or []
    return {
        row["angle_type"]: float(row.get("change_score") or 0.0)
        for row in rows
    }


def _trend_label(avg_delta: float) -> str:
    if avg_delta < STABLE_THRESHOLD:
        return "stable"
    if avg_delta < MILD_THRESHOLD:
        return "mild_variation"
    return "significant_shift"


def compare_sessions(current_session_id: str, previous_session_id: str) -> Dict[str, object]:
    current_scores = _load_angle_scores(current_session_id)
    previous_scores = _load_angle_scores(previous_session_id)

    if not current_scores or not previous_scores:
        raise ValueError("Missing analysis results for one or both sessions")

    per_angle: List[Dict[str, object]] = []
    deltas: List[float] = []

    for angle_type, current_score in current_scores.items():
        previous_score = previous_scores.get(angle_type)
        if previous_score is None:
            continue
        delta = current_score - previous_score
        delta_magnitude = abs(delta)
        deltas.append(delta_magnitude)
        per_angle.append(
            {
                "angle_type": angle_type,
                "current_score": current_score,
                "previous_score": previous_score,
                "delta": delta,
                "delta_magnitude": delta_magnitude,
            }
        )

    avg_delta = sum(deltas) / len(deltas) if deltas else 0.0
    stability_index = max(0.0, min(1.0, 1.0 - avg_delta))

    return {
        "per_angle": per_angle,
        "overall_delta": avg_delta,
        "stability_index": stability_index,
        "overall_trend": _trend_label(avg_delta),
    }
