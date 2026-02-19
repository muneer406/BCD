"""
BCD Backend - analysis_service.py
Phase 5: Multi-angle aggregation, correct baseline comparison, trend tracking,
         image quality scoring, confidence scoring, and variation level mapping.
"""

import logging
import time
from collections import defaultdict
from typing import Dict, List, Optional
import json
import numpy as np

from ..processing.embedding import extract_embedding
from ..processing.preprocessing import preprocess_pipeline
from ..processing.quality import (
    compute_analysis_confidence,
    compute_consistency_score,
    compute_session_quality,
    variation_level,
)
from .db import get_supabase_client

logger = logging.getLogger(__name__)


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
    """Store per-angle embeddings (idempotent: delete then insert).
    Silently skips if the angle_embeddings table does not exist yet
    (run PHASE4_MIGRATION.sql to create it).
    """
    try:
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
    except Exception:
        # Table not yet created — skip gracefully until migration is run
        pass


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
    Phase 5 analysis pipeline.

    Aggregation hierarchy:
        image  →  angle embedding (mean of images for that angle)
        angle  →  session embedding (mean of angle embeddings)

    Phase 5 additions:
        - Per-image and per-angle quality scoring (blur + brightness).
        - Session quality score (aggregate).
        - Analysis confidence score (quality × consistency × coverage × history).
        - variation_level label on every change score (neutral, non-diagnostic).
        - image_quality_summary and baseline_used in return dict for API transparency.

    Returns dict consumed by _persist_analysis and the API response.
    """
    t_start = time.monotonic()
    supabase = get_supabase_client()

    # ── 1. Load prior baseline (excludes current session) ────────────────────
    user_baseline = _load_user_baseline(user_id, exclude_session_id=session_id)
    is_first_session = user_baseline is None

    # ── 2. Group images by angle type (multi-image support) ──────────────────
    angle_groups: Dict[str, List[dict]] = defaultdict(list)
    for image_record in images:
        angle_type = image_record.get("image_type", "unknown")
        angle_groups[angle_type].append(image_record)

    # ── 3. Extract embeddings per angle with quality scoring ──────────────────
    angle_embeddings: Dict[str, np.ndarray] = {}
    per_angle_results: List[Dict[str, object]] = []
    angle_quality_scores: Dict[str, float] = {}

    for angle_type, angle_images in angle_groups.items():
        image_embeddings_for_angle: List[np.ndarray] = []
        image_quality_scores_for_angle: List[float] = []
        image_quality_details: List[dict] = []

        for image_record in angle_images:
            storage_path = image_record.get("storage_path", "")
            result = preprocess_pipeline(storage_path, supabase)
            embedding = extract_embedding(
                result.image, user_mean=user_baseline)
            image_embeddings_for_angle.append(embedding)

            q = result.quality
            image_quality_scores_for_angle.append(q.quality_score)
            image_quality_details.append({
                "blur_score": q.blur_score,
                "brightness": q.brightness,
                "is_blurry": q.is_blurry,
                "is_too_dark": q.is_too_dark,
                "is_too_bright": q.is_too_bright,
                "quality_score": q.quality_score,
            })

        # Angle embedding = mean across all images for this angle
        angle_embedding = np.mean(image_embeddings_for_angle, axis=0)
        angle_embeddings[angle_type] = angle_embedding

        # Per-angle quality score
        angle_q = float(np.mean(image_quality_scores_for_angle))
        angle_quality_scores[angle_type] = round(angle_q, 4)

        # Change score: distance from baseline; 0 for first session
        if not is_first_session:
            change_score = min(1.0, _cosine_distance(
                angle_embedding, user_baseline))
        else:
            change_score = 0.0

        per_angle_results.append({
            "angle_type": angle_type,
            "change_score": float(change_score),
            "variation_level": variation_level(change_score),
            "angle_quality_score": round(angle_q, 4),
            "image_quality": image_quality_details,
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

    # ── 8. Quality + confidence aggregation ──────────────────────────────────
    session_quality_score = compute_session_quality(angle_quality_scores)
    angle_change_scores_list = [float(a["change_score"])
                                for a in per_angle_results]
    consistency_score = compute_consistency_score(angle_change_scores_list)
    analysis_confidence_score = compute_analysis_confidence(
        session_quality_score=session_quality_score,
        consistency_score=consistency_score,
        n_angles=len(angle_groups),
        is_first_session=is_first_session,
    )

    # ── 9. Image quality summary for API trust response ───────────────────────
    all_image_details: List[dict] = []
    for angle_result in per_angle_results:
        # type: ignore[union-attr]
        for img_q in angle_result.get("image_quality", []):
            all_image_details.append({
                "angle_type": angle_result["angle_type"],
                **img_q,  # type: ignore[arg-type]
            })

    low_quality_angles = [
        a["angle_type"] for a in per_angle_results
        if float(a["angle_quality_score"]) < 0.4  # type: ignore[arg-type]
    ]
    blurry_count = sum(1 for d in all_image_details if d.get("is_blurry"))

    image_quality_summary = {
        "session_quality_score": session_quality_score,
        "analysis_confidence_score": analysis_confidence_score,
        "consistency_score": consistency_score,
        "low_quality_angles": low_quality_angles,
        "blurry_images_count": blurry_count,
        "total_images": len(all_image_details),
    }

    elapsed_ms = int((time.monotonic() - t_start) * 1000)
    logger.info(
        "analyze_session complete | session=%s user=%s time_ms=%d confidence=%.3f angles=%d",
        session_id, user_id, elapsed_ms, analysis_confidence_score, len(
            angle_groups),
    )

    return {
        "per_angle": per_angle_results,
        "overall_summary": (
            "Baseline established. Future sessions will be compared to this."
            if is_first_session
            else "ML analysis complete. Scores reflect distance from your personal baseline."
        ),
        "scores": {
            "overall_change_score": float(overall_change_score),
            "variation_level": variation_level(overall_change_score),
            "trend_score": float(trend_score) if trend_score is not None else None,
            "is_first_session": is_first_session,
            "analysis_confidence_score": analysis_confidence_score,
            "session_quality_score": session_quality_score,
        },
        "image_quality_summary": image_quality_summary,
        "baseline_used": "lifetime_mean" if not is_first_session else "none",
        "comparison_layers_used": [] if is_first_session else ["lifetime_baseline"],
        "processing_time_ms": elapsed_ms,
    }
