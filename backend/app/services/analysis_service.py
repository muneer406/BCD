"""
BCD Backend - analysis_service.py
Phase 4: Multi-angle aggregation, correct baseline comparison, trend tracking.
"""

from collections import defaultdict
from typing import Dict, List, Optional
import json
import numpy as np

from ..processing.embedding import extract_embedding
from ..processing.preprocessing import preprocess_pipeline
from .db import get_supabase_client


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_embedding(raw) -> Optional[np.ndarray]:
    """Parse an embedding from DB (vector string, JSON string, or list)."""
    if raw is None:
        return None
    if isinstance(raw, str):
        raw = json.loads(raw)
    return np.array(raw, dtype=np.float32)


def _cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine distance = 1 − cosine_similarity. Returns 1.0 if either vector is zero."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 1.0
    return float(1.0 - np.dot(a, b) / (norm_a * norm_b))


# ---------------------------------------------------------------------------
# Baseline loading
# ---------------------------------------------------------------------------

def _load_user_baseline(user_id: str, exclude_session_id: str) -> Optional[np.ndarray]:
    """
    Rolling lifetime baseline: mean of ALL stored session embeddings for user,
    excluding the current session (so baseline is always prior sessions only).
    Returns None for first session (no prior data).
    """
    supabase = get_supabase_client()
    result = (
        supabase.table("session_embeddings")
        .select("embedding")
        .eq("user_id", user_id)
        .neq("session_id", exclude_session_id)
        .execute()
    )
    if not result.data:
        return None

    rows: list = result.data or []
    embeddings = [_parse_embedding(row["embedding"]) for row in rows]
    embeddings = [e for e in embeddings if e is not None]
    if not embeddings:
        return None
    return np.mean(embeddings, axis=0)


# ---------------------------------------------------------------------------
# Trend score
# ---------------------------------------------------------------------------

def _load_trend_score(user_id: str, exclude_session_id: str, n: int = 5) -> Optional[float]:
    """
    Compute moving-average trend score from last N sessions' overall_change_scores.
    Returns None if there is no prior history.
    """
    supabase = get_supabase_client()
    result = (
        supabase.table("session_analysis")
        .select("overall_change_score")
        .eq("user_id", user_id)
        .neq("session_id", exclude_session_id)
        .order("created_at", desc=True)
        .limit(n)
        .execute()
    )
    score_rows: list = result.data or []
    scores = [
        float(row["overall_change_score"])
        for row in score_rows
        if row.get("overall_change_score") is not None
    ]
    if not scores:
        return None
    return float(np.mean(scores))


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

def _store_angle_embeddings(session_id: str, user_id: str, angle_embeddings: Dict[str, np.ndarray]) -> None:
    """Store per-angle embeddings (idempotent: delete then insert)."""
    supabase = get_supabase_client()
    supabase.table("angle_embeddings").delete().eq(
        "session_id", session_id).execute()
    rows = [
        {
            "session_id": session_id,
            "user_id": user_id,
            "angle_type": angle_type,
            "embedding": embedding.tolist(),
        }
        for angle_type, embedding in angle_embeddings.items()
    ]
    if rows:
        supabase.table("angle_embeddings").insert(rows).execute()


def _store_session_embedding(session_id: str, user_id: str, embedding: np.ndarray) -> None:
    """Store session-level embedding (idempotent)."""
    supabase = get_supabase_client()
    supabase.table("session_embeddings").delete().eq(
        "session_id", session_id).execute()
    supabase.table("session_embeddings").insert({
        "session_id": session_id,
        "user_id": user_id,
        "embedding": embedding.tolist(),
    }).execute()


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def analyze_session(images: List[dict], user_id: str, session_id: str) -> Dict[str, object]:
    """
    Phase 4 analysis pipeline.

    Aggregation hierarchy:
        image  →  angle embedding (mean of images for that angle)
        angle  →  session embedding (mean of angle embeddings)

    Comparison:
        Each angle and the session overall are compared against the user's
        lifetime baseline (mean of all prior session embeddings).
        First session always returns change_score = 0 (establishes baseline).

    Returns dict consumed by _persist_analysis and the API response.
    """
    supabase = get_supabase_client()

    # ── 1. Load prior baseline (excludes current session) ────────────────────
    user_baseline = _load_user_baseline(user_id, exclude_session_id=session_id)
    is_first_session = user_baseline is None

    # ── 2. Group images by angle type (multi-image support) ──────────────────
    angle_groups: Dict[str, List[dict]] = defaultdict(list)
    for image_record in images:
        angle_type = image_record.get("image_type", "unknown")
        angle_groups[angle_type].append(image_record)

    # ── 3. Extract embeddings per angle → compute angle-level mean ───────────
    angle_embeddings: Dict[str, np.ndarray] = {}
    per_angle_results: List[Dict[str, object]] = []

    for angle_type, angle_images in angle_groups.items():
        image_embeddings_for_angle: List[np.ndarray] = []

        for image_record in angle_images:
            storage_path = image_record.get("storage_path", "")
            processed_image = preprocess_pipeline(storage_path, supabase)
            # Pass user_mean for per-user normalization (subtracts baseline mean)
            embedding = extract_embedding(
                processed_image, user_mean=user_baseline)
            image_embeddings_for_angle.append(embedding)

        # Angle embedding = mean across all images captured for this angle
        angle_embedding = np.mean(image_embeddings_for_angle, axis=0)
        angle_embeddings[angle_type] = angle_embedding

        # Change score: distance from baseline; 0 for first session
        if not is_first_session:
            change_score = min(1.0, _cosine_distance(
                angle_embedding, user_baseline))
        else:
            change_score = 0.0

        per_angle_results.append({
            "angle_type": angle_type,
            "change_score": float(change_score),
            "summary": f"Distance-based analysis for {angle_type} angle.",
        })

    # ── 4. Session embedding = mean of angle embeddings ──────────────────────
    session_embedding = np.mean(list(angle_embeddings.values()), axis=0)

    # ── 5. Store embeddings ───────────────────────────────────────────────────
    _store_angle_embeddings(session_id, user_id, angle_embeddings)
    _store_session_embedding(session_id, user_id, session_embedding)

    # ── 6. Overall change score ───────────────────────────────────────────────
    if not is_first_session:
        overall_change_score = min(1.0, _cosine_distance(
            session_embedding, user_baseline))
    else:
        overall_change_score = 0.0

    # ── 7. Trend score (moving average of last 5 prior sessions) ─────────────
    trend_score = _load_trend_score(user_id, exclude_session_id=session_id)

    return {
        "per_angle": per_angle_results,
        "overall_summary": (
            "Baseline established. Future sessions will be compared to this."
            if is_first_session
            else "ML analysis complete. Scores reflect distance from your personal baseline."
        ),
        "scores": {
            "overall_change_score": float(overall_change_score),
            "trend_score": float(trend_score) if trend_score is not None else None,
            "is_first_session": is_first_session,
        },
    }
