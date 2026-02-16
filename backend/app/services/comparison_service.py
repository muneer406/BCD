"""
BCD Backend - comparison_service.py
Session comparison using embedding-based distance metrics.
"""

from typing import Dict, List
import numpy as np

from .db import get_supabase_client


STABLE_THRESHOLD = 0.1
MILD_THRESHOLD = 0.25


def _load_angle_scores(session_id: str) -> Dict[str, float]:
    """
    Load per-angle change scores from database.
    """
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


def _load_session_embedding(session_id: str) -> np.ndarray | None:
    """
    Load session embedding from database.
    """
    supabase = get_supabase_client()
    result = (
        supabase.table("session_embeddings")
        .select("embedding")
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    )

    if not result.data:
        return None

    return np.array(result.data[0]["embedding"])


def _cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    """
    Calculate cosine distance between two vectors.
    """
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0:
        return 1.0

    cosine_sim = dot_product / (norm_a * norm_b)
    return 1.0 - cosine_sim


def _trend_label(distance: float) -> str:
    """
    Classify trend based on embedding distance.
    """
    if distance < STABLE_THRESHOLD:
        return "stable"
    if distance < MILD_THRESHOLD:
        return "mild_variation"
    return "significant_shift"


def compare_sessions(current_session_id: str, previous_session_id: str) -> Dict[str, object]:
    """
    Compare two sessions using both embedding distance and angle scores.

    Args:
        current_session_id: Current session ID
        previous_session_id: Previous session ID

    Returns:
        Comparison results with per-angle deltas and overall metrics
    """
    # Load angle scores for detailed comparison
    current_scores = _load_angle_scores(current_session_id)
    previous_scores = _load_angle_scores(previous_session_id)

    if not current_scores or not previous_scores:
        raise ValueError("Missing analysis results for one or both sessions")

    # Load session embeddings for overall comparison
    current_embedding = _load_session_embedding(current_session_id)
    previous_embedding = _load_session_embedding(previous_session_id)

    # Calculate per-angle score deltas
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

    # Calculate embedding-based distance if available
    if current_embedding is not None and previous_embedding is not None:
        embedding_distance = _cosine_distance(
            current_embedding, previous_embedding)
        overall_trend = _trend_label(embedding_distance)
        stability_index = max(0.0, min(1.0, 1.0 - embedding_distance))
    else:
        # Fallback to score-based comparison
        embedding_distance = avg_delta
        overall_trend = _trend_label(avg_delta)
        stability_index = max(0.0, min(1.0, 1.0 - avg_delta))

    return {
        "per_angle": per_angle,
        "overall_delta": float(embedding_distance),
        "stability_index": float(stability_index),
        "overall_trend": overall_trend,
        "comparison_method": "embedding" if current_embedding is not None else "score"
    }
