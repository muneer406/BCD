"""
BCD Backend - analysis_service.py
Phase 5: Multi-angle aggregation, correct baseline comparison, trend tracking,
         image quality scoring, confidence scoring, and variation level mapping.
Phase 7: angle_aware_score (mean of per-angle change scores — angle-assignment-sensitive);
         analysis_version tag; analysis_logs table writes.
"""

import logging
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple
import json
import numpy as np

from ..processing.embedding import (
    EMBEDDING_DIM,
    extract_embedding,
    extract_embeddings_batch,
)
from ..processing.preprocessing import preprocess_pipeline
from ..processing.region_grid import split_regions_224
from ..processing.quality import (
    compute_analysis_confidence,
    compute_consistency_score,
    compute_session_quality,
    variation_level,
)
from .db import get_supabase_client
from .localized_insights import build_localized_insights
from .session_service import get_previous_session_id

logger = logging.getLogger(__name__)

ANALYSIS_VERSION = "v0.8"   # Bump when model or pipeline changes


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


def _load_per_angle_baselines(user_id: str, exclude_session_id: str) -> Dict[str, np.ndarray]:
    """
    For each angle type, compute the mean embedding from ALL prior sessions.
    This gives an angle-specific baseline so front-view scores reflect
    distance from prior front-view images, not from a blended session mean.
    Returns empty dict if no prior angle data exists (first session).
    """
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("angle_embeddings")
            .select("angle_type, embedding")
            .eq("user_id", user_id)
            .neq("session_id", exclude_session_id)
            .execute()
        )
        if not result.data:
            return {}

        groups: Dict[str, List[np.ndarray]] = {}
        for row in result.data:
            emb = _parse_embedding(row["embedding"])
            if emb is not None:
                atype = row["angle_type"]
                groups.setdefault(atype, []).append(emb)

        return {atype: np.mean(embs, axis=0) for atype, embs in groups.items()}
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Trend score
# ---------------------------------------------------------------------------

def _load_trend_score(user_id: str, exclude_session_id: str, n: int = 5) -> Optional[float]:
    """
    Moving-average trend from last N sessions using angle-aware scores when available,
    else overall_change_score (legacy rows).
    """
    supabase = get_supabase_client()
    result = (
        supabase.table("session_analysis")
        .select("angle_aware_score, overall_change_score")
        .eq("user_id", user_id)
        .neq("session_id", exclude_session_id)
        .order("created_at", desc=True)
        .limit(n)
        .execute()
    )
    score_rows: list = result.data or []
    scores: List[float] = []
    for row in score_rows:
        if row.get("angle_aware_score") is not None:
            scores.append(float(row["angle_aware_score"]))
        elif row.get("overall_change_score") is not None:
            scores.append(float(row["overall_change_score"]))
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


def _store_region_embeddings(
    session_id: str, user_id: str, region_by_angle: Dict[str, np.ndarray],
) -> None:
    """Persist 3×3 region embeddings per angle (requires PHASE8 region_embeddings table)."""
    try:
        supabase = get_supabase_client()
        supabase.table("region_embeddings").delete().eq(
            "session_id", session_id).execute()
        rows: List[dict] = []
        for angle_type, mat in region_by_angle.items():
            if mat.shape[0] != 9:
                continue
            for ri in range(9):
                rows.append({
                    "session_id": session_id,
                    "user_id": user_id,
                    "angle_type": angle_type,
                    "region_index": ri,
                    "embedding": mat[ri].tolist(),
                })
        if rows:
            supabase.table("region_embeddings").insert(rows).execute()
    except Exception:
        pass


def _load_per_region_baselines(
    user_id: str, exclude_session_id: str,
) -> Dict[Tuple[str, int], np.ndarray]:
    """Mean embedding per (angle_type, region_index) across all prior sessions."""
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("region_embeddings")
            .select("angle_type, region_index, embedding")
            .eq("user_id", user_id)
            .neq("session_id", exclude_session_id)
            .execute()
        )
        groups: Dict[Tuple[str, int], List[np.ndarray]] = {}
        for row in (result.data or []):
            emb = _parse_embedding(row.get("embedding"))
            if emb is None:
                continue
            key = (str(row["angle_type"]), int(row["region_index"]))
            groups.setdefault(key, []).append(emb)
        return {k: np.mean(v, axis=0) for k, v in groups.items()}
    except Exception:
        return {}


def _load_session_region_embeddings(
    session_id: str,
) -> Dict[Tuple[str, int], np.ndarray]:
    """All region embeddings for one session."""
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("region_embeddings")
            .select("angle_type, region_index, embedding")
            .eq("session_id", session_id)
            .execute()
        )
        out: Dict[Tuple[str, int], np.ndarray] = {}
        for row in (result.data or []):
            emb = _parse_embedding(row.get("embedding"))
            if emb is None:
                continue
            out[(str(row["angle_type"]), int(row["region_index"]))] = emb
        return out
    except Exception:
        return {}


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
    per_angle_baselines = _load_per_angle_baselines(
        user_id, exclude_session_id=session_id)
    is_first_session = user_baseline is None

    # ── 2. Group images by angle type (multi-image support) ──────────────────
    angle_groups: Dict[str, List[dict]] = defaultdict(list)
    for image_record in images:
        angle_type = image_record.get("image_type", "unknown")
        angle_groups[angle_type].append(image_record)

    # ── 3. Extract embeddings per angle with quality scoring (parallel) ───────
    angle_embeddings: Dict[str, np.ndarray] = {}
    region_by_angle: Dict[str, np.ndarray] = {}
    per_angle_results: List[Dict[str, object]] = []
    angle_quality_scores: Dict[str, float] = {}

    def _process_angle(
        args: Tuple[str, List[dict]]
    ) -> Tuple[str, np.ndarray, float, List[dict], float, np.ndarray]:
        """Process all images for one angle in a worker thread.
        Returns (angle_type, embedding, quality_score, quality_details, change_score,
        region_matrix) where region_matrix is (9, dim) mean of 3×3 grid embeddings.
        """
        _angle_type, _angle_images = args
        _supabase = get_supabase_client()
        _embeddings: List[np.ndarray] = []
        _quality_scores: List[float] = []
        _quality_details: List[dict] = []
        _region_batches: List[np.ndarray] = []

        for _rec in _angle_images:
            _path = _rec.get("storage_path", "")
            _result = preprocess_pipeline(_path, _supabase)
            _emb = extract_embedding(_result.image)
            _embeddings.append(_emb)
            crops = split_regions_224(_result.image)
            batch_emb = extract_embeddings_batch(crops)
            _region_batches.append(batch_emb)
            _q = _result.quality
            _quality_scores.append(_q.quality_score)
            _quality_details.append({
                "blur_score": _q.blur_score,
                "brightness": _q.brightness,
                "is_blurry": _q.is_blurry,
                "is_too_dark": _q.is_too_dark,
                "is_too_bright": _q.is_too_bright,
                "quality_score": _q.quality_score,
            })

        _embedding = np.mean(_embeddings, axis=0)
        _aq = float(np.mean(_quality_scores))
        _region_mean = (
            np.mean(_region_batches, axis=0)
            if _region_batches
            else np.zeros((9, EMBEDDING_DIM), dtype=np.float32)
        )

        # Use angle-specific baseline if available; fall back to session mean.
        # This ensures front-view scores reflect distance from prior front-view
        # embeddings rather than a blended session mean.
        _angle_baseline = per_angle_baselines.get(_angle_type, user_baseline)
        _change = (
            min(1.0, _cosine_distance(_embedding, _angle_baseline))
            if not is_first_session and _angle_baseline is not None
            else 0.0
        )
        return _angle_type, _embedding, _aq, _quality_details, _change, _region_mean

    # Run all angles concurrently — one thread per angle (max 6)
    n_workers = min(len(angle_groups), 6)
    with ThreadPoolExecutor(max_workers=n_workers) as pool:
        futures = {pool.submit(_process_angle, item): item[0]
                   for item in angle_groups.items()}
        for future in as_completed(futures):
            a_type, a_emb, a_q, a_qd, a_change, a_regions = future.result()
            angle_embeddings[a_type] = a_emb
            region_by_angle[a_type] = a_regions
            angle_quality_scores[a_type] = round(a_q, 4)
            per_angle_results.append({
                "angle_type": a_type,
                "change_score": float(a_change),
                "variation_level": variation_level(a_change),
                "angle_quality_score": round(a_q, 4),
                "image_quality": a_qd,
                "summary": f"Distance-based analysis for {a_type} angle.",
            })

    # ── 4. Session embedding = mean of angle embeddings ──────────────────────
    session_embedding = np.mean(list(angle_embeddings.values()), axis=0)

    # ── 4b. Localized region insights (baseline + last session), non-diagnostic ─
    localized_insights_list: List[str] = []
    if not is_first_session:
        baseline_regions = _load_per_region_baselines(user_id, session_id)
        prev_sid = get_previous_session_id(user_id, session_id)
        last_regions = (
            _load_session_region_embeddings(prev_sid) if prev_sid else {}
        )
        localized_insights_list = build_localized_insights(
            region_by_angle,
            baseline_regions,
            last_regions,
            angle_embeddings,
            per_angle_baselines,
            is_first_session=False,
        )

    # ── 5. Store embeddings ───────────────────────────────────────────────────
    _store_angle_embeddings(session_id, user_id, angle_embeddings)
    _store_session_embedding(session_id, user_id, session_embedding)
    _store_region_embeddings(session_id, user_id, region_by_angle)

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

    # ── 8b. Angle-aware score (Phase 7) ──────────────────────────────────────
    # Mean of per-angle change_scores.  Unlike overall_change_score (which uses
    # the session-level mean embedding and is order-invariant), this score is
    # ANGLE-ASSIGNMENT-SENSITIVE: if images are swapped between angle slots the
    # score will change even if the session-level embedding stays the same.
    angle_aware_score = (
        float(np.mean(angle_change_scores_list))
        if angle_change_scores_list
        else 0.0
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
        "analyze_session complete | session=%s user=%s time_ms=%d confidence=%.3f angles=%d angle_aware=%.3f",
        session_id, user_id, elapsed_ms, analysis_confidence_score,
        len(angle_groups), angle_aware_score,
    )

    # ── 10. Write analysis log (Phase 7) ─────────────────────────────────────
    try:
        supabase.table("analysis_logs").insert({
            "session_id": session_id,
            "user_id": user_id,
            "processing_time_ms": elapsed_ms,
            "status": "completed",
            "confidence_score": analysis_confidence_score,
        }).execute()
    except Exception as log_err:
        # Gracefully skip if table or column doesn't exist yet (PHASE5/7 migration not run)
        logger.warning("analysis_logs write skipped: %s", log_err)

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
            "angle_aware_score": angle_aware_score,
            "angle_aware_variation_level": variation_level(angle_aware_score),
            "trend_score": float(trend_score) if trend_score is not None else None,
            "is_first_session": is_first_session,
            "analysis_confidence_score": analysis_confidence_score,
            "session_quality_score": session_quality_score,
            "analysis_version": ANALYSIS_VERSION,
        },
        "image_quality_summary": image_quality_summary,
        "baseline_used": "lifetime_mean" if not is_first_session else "none",
        "comparison_layers_used": [] if is_first_session else ["lifetime_baseline"],
        "processing_time_ms": elapsed_ms,
        "localized_insights": localized_insights_list,
    }
