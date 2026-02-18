"""
BCD Backend - comparison_service.py
Phase 4: Structured comparison layers — immediate, rolling, monthly, lifetime,
         plus per-angle embedding comparison.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
import json
import numpy as np

from .db import get_supabase_client


STABLE_THRESHOLD = 0.1
MILD_THRESHOLD = 0.25


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _parse_embedding(raw) -> Optional[np.ndarray]:
    """Parse embedding from DB (vector string, JSON string, or list)."""
    if raw is None:
        return None
    if isinstance(raw, str):
        raw = json.loads(raw)
    return np.array(raw, dtype=np.float32)


def _cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 1.0
    return float(1.0 - np.dot(a, b) / (norm_a * norm_b))


def _trend_label(distance: float) -> str:
    if distance < STABLE_THRESHOLD:
        return "stable"
    if distance < MILD_THRESHOLD:
        return "mild_variation"
    return "significant_shift"


def _mean_of_embeddings(embeddings: List[np.ndarray]) -> Optional[np.ndarray]:
    if not embeddings:
        return None
    return np.mean(embeddings, axis=0)


# ---------------------------------------------------------------------------
# DB loaders
# ---------------------------------------------------------------------------

def _load_angle_scores(session_id: str) -> Dict[str, float]:
    """Load per-angle change scores from angle_analysis table."""
    supabase = get_supabase_client()
    result = (
        supabase.table("angle_analysis")
        .select("angle_type, change_score")
        .eq("session_id", session_id)
        .execute()
    )
    return {
        row["angle_type"]: float(row.get("change_score") or 0.0)
        for row in (result.data or [])
    }


def _load_angle_embeddings(session_id: str) -> Dict[str, np.ndarray]:
    """Load per-angle embeddings from angle_embeddings table.
    Returns empty dict if the table does not exist yet
    (run PHASE4_MIGRATION.sql to create it).
    """
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("angle_embeddings")
            .select("angle_type, embedding")
            .eq("session_id", session_id)
            .execute()
        )
        out: Dict[str, np.ndarray] = {}
        for row in (result.data or []):
            emb = _parse_embedding(row["embedding"])
            if emb is not None:
                out[row["angle_type"]] = emb
        return out
    except Exception:
        return {}


def _load_session_embedding(session_id: str) -> Optional[np.ndarray]:
    """Load session-level embedding."""
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
    return _parse_embedding(result.data[0]["embedding"])


def _load_rolling_baseline(user_id: str, current_session_id: str, n: int = 5) -> Optional[np.ndarray]:
    """Mean embedding of last N sessions (excluding current)."""
    supabase = get_supabase_client()
    result = (
        supabase.table("session_embeddings")
        .select("embedding")
        .eq("user_id", user_id)
        .neq("session_id", current_session_id)
        .order("created_at", desc=True)
        .limit(n)
        .execute()
    )
    embeddings = [_parse_embedding(r["embedding"])
                  for r in (result.data or [])]
    return _mean_of_embeddings([e for e in embeddings if e is not None])


def _load_monthly_baseline(user_id: str, current_session_id: str) -> Optional[np.ndarray]:
    """Mean embedding of sessions created in the last 30 days (excluding current)."""
    supabase = get_supabase_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    result = (
        supabase.table("session_embeddings")
        .select("embedding")
        .eq("user_id", user_id)
        .neq("session_id", current_session_id)
        .gte("created_at", cutoff)
        .execute()
    )
    embeddings = [_parse_embedding(r["embedding"])
                  for r in (result.data or [])]
    return _mean_of_embeddings([e for e in embeddings if e is not None])


def _load_lifetime_baseline(user_id: str, current_session_id: str) -> Optional[np.ndarray]:
    """Mean embedding of ALL sessions (excluding current) — lifetime reference."""
    supabase = get_supabase_client()
    result = (
        supabase.table("session_embeddings")
        .select("embedding")
        .eq("user_id", user_id)
        .neq("session_id", current_session_id)
        .execute()
    )
    embeddings = [_parse_embedding(r["embedding"])
                  for r in (result.data or [])]
    return _mean_of_embeddings([e for e in embeddings if e is not None])


# ---------------------------------------------------------------------------
# Main comparison
# ---------------------------------------------------------------------------

def compare_sessions(
    current_session_id: str,
    previous_session_id: str,
    user_id: str,
) -> Dict[str, object]:
    """
    Phase 4 structured comparison.

    Comparison layers:
      1. Immediate   – current vs previous session embedding
      2. Rolling     – current vs mean of last 3–5 sessions
      3. Monthly     – current vs mean of sessions in last 30 days
      4. Lifetime    – current vs mean of ALL prior sessions
      5. Angle-level – per-angle embedding distance + score delta

    Returns full comparison dict consumed by the API handler and frontend.
    """
    # ── Load per-angle scores (required) ─────────────────────────────────────
    current_scores = _load_angle_scores(current_session_id)
    previous_scores = _load_angle_scores(previous_session_id)

    if not current_scores or not previous_scores:
        raise ValueError(
            "Missing analysis results for one or both sessions. Run analyze-session first.")

    # ── Load session embeddings ───────────────────────────────────────────────
    current_emb = _load_session_embedding(current_session_id)
    previous_emb = _load_session_embedding(previous_session_id)

    # ── Load per-angle embeddings ─────────────────────────────────────────────
    current_angle_embs = _load_angle_embeddings(current_session_id)
    previous_angle_embs = _load_angle_embeddings(previous_session_id)

    # ── Layer 1: Immediate comparison (current vs previous) ──────────────────
    if current_emb is not None and previous_emb is not None:
        immediate_delta = _cosine_distance(current_emb, previous_emb)
        comparison_method = "embedding"
    else:
        immediate_delta = 0.0
        comparison_method = "score"

    # ── Layer 2: Rolling baseline (last 3–5 sessions) ────────────────────────
    rolling_baseline = _load_rolling_baseline(user_id, current_session_id, n=5)
    rolling_delta = (
        _cosine_distance(current_emb, rolling_baseline)
        if current_emb is not None and rolling_baseline is not None
        else None
    )

    # ── Layer 3: Monthly baseline (last 30 days) ──────────────────────────────
    monthly_baseline = _load_monthly_baseline(user_id, current_session_id)
    monthly_delta = (
        _cosine_distance(current_emb, monthly_baseline)
        if current_emb is not None and monthly_baseline is not None
        else None
    )

    # ── Layer 4: Lifetime baseline (all prior sessions) ───────────────────────
    lifetime_baseline = _load_lifetime_baseline(user_id, current_session_id)
    lifetime_delta = (
        _cosine_distance(current_emb, lifetime_baseline)
        if current_emb is not None and lifetime_baseline is not None
        else None
    )

    # ── Layer 5: Per-angle comparison ─────────────────────────────────────────
    per_angle: List[Dict[str, object]] = []
    score_deltas: List[float] = []

    for angle_type, current_score in current_scores.items():
        previous_score = previous_scores.get(angle_type)
        if previous_score is None:
            continue

        score_delta = current_score - previous_score
        score_deltas.append(abs(score_delta))

        # Angle-level embedding distance
        c_angle_emb = current_angle_embs.get(angle_type)
        p_angle_emb = previous_angle_embs.get(angle_type)
        angle_embedding_distance = (
            _cosine_distance(c_angle_emb, p_angle_emb)
            if c_angle_emb is not None and p_angle_emb is not None
            else None
        )

        per_angle.append({
            "angle_type": angle_type,
            "current_score": current_score,
            "previous_score": previous_score,
            "delta": score_delta,
            "delta_magnitude": abs(score_delta),
            "embedding_distance": angle_embedding_distance,
        })

    avg_score_delta = sum(score_deltas) / \
        len(score_deltas) if score_deltas else 0.0

    # Use best available overall delta
    overall_delta = immediate_delta if comparison_method == "embedding" else avg_score_delta
    overall_trend = _trend_label(overall_delta)
    stability_index = max(0.0, min(1.0, 1.0 - overall_delta))

    return {
        "per_angle": per_angle,
        # Immediate comparison
        "overall_delta":    float(overall_delta),
        "stability_index":  float(stability_index),
        "overall_trend":    overall_trend,
        "comparison_method": comparison_method,
        # Extended comparison layers
        "rolling_baseline": {
            "delta": float(rolling_delta) if rolling_delta is not None else None,
            "trend": _trend_label(rolling_delta) if rolling_delta is not None else None,
            "available": rolling_delta is not None,
        },
        "monthly_baseline": {
            "delta": float(monthly_delta) if monthly_delta is not None else None,
            "trend": _trend_label(monthly_delta) if monthly_delta is not None else None,
            "available": monthly_delta is not None,
        },
        "lifetime_baseline": {
            "delta": float(lifetime_delta) if lifetime_delta is not None else None,
            "trend": _trend_label(lifetime_delta) if lifetime_delta is not None else None,
            "available": lifetime_delta is not None,
        },
    }
