import logging
import os
from threading import Lock
from typing import Optional

import numpy as np

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from ..dependencies import get_current_user
from ..limiter import limiter
from ..processing.embedding import compute_phash, phash_hamming_distance
from ..processing.quality import variation_level
from ..services.analysis_fetch_service import get_session_analysis as fetch_cached_analysis
from ..services.analysis_service import analyze_session as run_analysis
from ..services.db import get_supabase_client
from ..services.image_service import get_session_images
from ..services.interpretation import generate_interpretation, interpretation_to_api_dict
from ..services.session_service import count_user_sessions, get_session
from ..utils.validation import validate_session_id

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])

# ---------------------------------------------------------------------------
# In-process async job status registry (Part 6)
# Map session_id → {"status": "processing"|"completed"|"failed", "error": str|None}
# ---------------------------------------------------------------------------
_analysis_jobs: dict = {}
_analysis_lock = Lock()


def _get_table_columns(supabase, table_name: str, schema: str = "public") -> set[str]:
    """Return the set of column names for a given table by querying information_schema."""
    try:
        response = supabase.rpc(
            "get_columns",
            {
                "p_table_name": table_name,
                "p_schema_name": schema,
            },
        ).execute()
        if response.data:
            return {row["column_name"] for row in response.data}
    except Exception as exc:
        logger.warning(
            "Could not query columns for %s.%s via RPC: %s", schema, table_name, exc
        )

    # Fallback to a direct information_schema query if the RPC helper is unavailable.
    try:
        response = (
            supabase.schema("information_schema")
            .table("columns")
            .select("column_name")
            .eq("table_schema", schema)
            .eq("table_name", table_name)
            .execute()
        )
        if response.data:
            return {row["column_name"] for row in response.data}
    except Exception as exc:
        logger.warning(
            "Could not query information_schema for %s.%s: %s", schema, table_name, exc
        )

    return set()


def _interpretation_payload(
    user_id: str,
    structural: float,
    angle_aware: Optional[float],
    confidence: Optional[float],
) -> dict:
    session_count = count_user_sessions(user_id)
    angle = float(angle_aware if angle_aware is not None else 0.0)
    conf = float(confidence if confidence is not None else 0.0)
    raw = generate_interpretation(structural, angle, conf, session_count)
    return interpretation_to_api_dict(raw, conf)


def _persist_analysis(session_id: str, user_id: str, analysis: dict) -> bool:
    supabase = get_supabase_client()
    existing = (
        supabase.table("session_analysis")
        .select("id")
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return True  # Already analyzed, skip overwrite
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
        # Detect available columns in angle_analysis so we don't rely on silent failures.
        angle_columns = _get_table_columns(supabase, "angle_analysis")
        if angle_columns:
            per_angle_rows = [
                {k: v for k, v in row.items() if k in angle_columns}
                for row in per_angle_rows
            ]
        try:
            supabase.table("angle_analysis").insert(per_angle_rows).execute()
        except Exception as exc:
            logger.warning(
                "Failed to insert angle_analysis rows for session %s (columns may mismatch): %s",
                session_id,
                exc,
            )

    scores = analysis.get("scores", {})
    quality_summary = analysis.get("image_quality_summary", {})
    full_session_row = {
        "session_id": session_id,
        "user_id": user_id,
        "overall_change_score": scores.get("overall_change_score", 0.0),
        "trend_score": scores.get("trend_score"),
        # Phase 5 columns
        "analysis_confidence_score": scores.get("analysis_confidence_score"),
        "session_quality_score": quality_summary.get("session_quality_score"),
        # Phase 7 columns
        "angle_aware_score": scores.get("angle_aware_score"),
        "analysis_version": scores.get("analysis_version"),
        # Phase 8: region-based copy (JSON array of strings)
        "localized_insights": analysis.get("localized_insights") or [],
        # First-session flag so cache reads don't have to infer it from scores
        "is_first_session": scores.get("is_first_session"),
    }

    # TODO: Replace runtime information_schema probing with an explicit schema-version
    # check at startup once the project ships a migration/version table. This would let
    # us fail fast on real schema mismatches instead of silently dropping columns.
    session_columns = _get_table_columns(supabase, "session_analysis")
    if session_columns:
        session_row = {
            k: v
            for k, v in full_session_row.items()
            if k in session_columns
        }
    else:
        # information_schema could not be queried; keep the legacy fallback pyramid
        # but make each level visible in the logs.
        session_row = full_session_row

    try:
        supabase.table("session_analysis").insert(session_row).execute()
    except Exception as exc:
        logger.warning(
            "Full session_analysis insert failed for session %s, trying Phase 5 subset: %s",
            session_id,
            exc,
        )
        try:
            p5_row = {
                k: v
                for k, v in session_row.items()
                if k not in ("angle_aware_score", "analysis_version", "localized_insights")
            }
            supabase.table("session_analysis").insert(p5_row).execute()
        except Exception as exc2:
            logger.warning(
                "Phase 5 session_analysis insert failed for session %s, trying Phase 4 subset: %s",
                session_id,
                exc2,
            )
            try:
                fallback_row = {
                    k: v
                    for k, v in session_row.items()
                    if k in ("session_id", "user_id", "overall_change_score", "trend_score")
                }
                supabase.table("session_analysis").insert(fallback_row).execute()
            except Exception as exc3:
                logger.warning(
                    "Phase 4 session_analysis insert failed for session %s, trying bare minimum: %s",
                    session_id,
                    exc3,
                )
                bare_row = {
                    "session_id": session_id,
                    "user_id": user_id,
                    "overall_change_score": scores.get("overall_change_score", 0.0),
                }
                supabase.table("session_analysis").insert(bare_row).execute()

    # Verify that the row actually made it into the DB.
    try:
        verify = (
            supabase.table("session_analysis")
            .select("id")
            .eq("session_id", session_id)
            .limit(1)
            .execute()
        )
        if not verify.data:
            logger.error("session_analysis row for session %s was not found after insert", session_id)
    except Exception as exc:
        logger.warning("Could not verify session_analysis insert for session %s: %s", session_id, exc)

    return overwritten


def _process_and_store(session_id: str, user_id: str, images: list) -> None:
    """Background task: run analysis, persist results, update job registry."""
    try:
        with _analysis_lock:
            _analysis_jobs[session_id] = {"status": "processing", "error": None}

        # pHash computation (informational only — always runs full PyTorch)
        try:
            from pathlib import Path
            import json as _json
            _phash_dir = Path(__file__).parent.parent / "evaluation" / "data" / "phashes"
            _phash_dir.mkdir(parents=True, exist_ok=True)
            _phash_file = _phash_dir / f"{user_id}.json"

            from ..processing.embedding import compute_phash, phash_hamming_distance
            from ..services.db import get_supabase_client as _gsc
            from ..processing.preprocessing import preprocess_pipeline as _pp
            _supa = _gsc()

            current_phashes = {}
            for img in images:
                angle = img.get("image_type")
                storage_path = img.get("storage_path", "")
                if not angle or not storage_path:
                    continue
                try:
                    proc = _pp(storage_path, _supa)
                    current_phashes[angle] = compute_phash(proc.image)
                except Exception:
                    pass

            if current_phashes and _phash_file.exists():
                try:
                    previous = _json.loads(_phash_file.read_text())
                    if previous:
                        dists = [phash_hamming_distance(current_phashes[a], previous[a])
                                 for a in current_phashes if a in previous]
                        if dists:
                            logger.info("pHash drift: avg=%.1f (logged only)", sum(dists)/len(dists))
                except Exception:
                    pass

            try:
                _phash_file.write_text(_json.dumps(current_phashes))
            except Exception:
                pass
        except Exception:
            pass

        # Full PyTorch pipeline — never skipped
        analysis = run_analysis(images, user_id, session_id)
        _persist_analysis(session_id, user_id, analysis)
        with _analysis_lock:
            _analysis_jobs[session_id] = {"status": "completed", "error": None}
    except Exception as exc:
        with _analysis_lock:
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

    err = validate_session_id(session_id)
    if err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err)

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
        with _analysis_lock:
            existing = _analysis_jobs.get(session_id)
            if existing and existing.get("status") == "processing":
                return {"success": True, "data": {"session_id": session_id, "status": "processing", "note": "Already queued"}}
            _analysis_jobs[session_id] = {"status": "processing", "error": None}
        # Persist job state to DB so it survives restarts
        try:
            supabase = get_supabase_client()
            supabase.table("analysis_logs").insert({
                "session_id": session_id,
                "user_id": user_id,
                "status": "processing",
                "processing_time_ms": None,
            }).execute()
        except Exception:
            pass  # Non-critical — in-memory fallback still works
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
            # Use the stored is_first_session flag from the DB analysis if available.
            # Cached analysis rows created before that flag existed may return None,
            # in which case fall back to counting the user's sessions directly.
            is_first = cached.get("is_first_session")
            if is_first is None:
                is_first = count_user_sessions(user_id) <= 1
            per_angle_with_levels = [
                {
                    **row,
                    "variation_level": variation_level(float(row.get("change_score") or 0.0)),
                }
                for row in cached["per_angle"]
            ]
            angle_aware = cached.get("angle_aware_score")
            analysis_ver = cached.get("analysis_version")
            ac_conf = cached.get("analysis_confidence_score")
            sq = cached.get("session_quality_score")
            confidence_for_interp = (
                float(ac_conf) if ac_conf is not None
                else (float(sq) if sq is not None else None)
            )
            interpretation = _interpretation_payload(
                user_id,
                overall_score,
                float(angle_aware) if angle_aware is not None else None,
                confidence_for_interp,
            )
            localized = cached.get("localized_insights")
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
                    "localized_insights": localized if isinstance(localized, list) else [],
                    "scores": {
                        "change_score": overall_score,
                        "variation_level": variation_level(overall_score),
                        "angle_aware_score": float(angle_aware) if angle_aware is not None else None,
                        "angle_aware_variation_level": variation_level(float(angle_aware)) if angle_aware is not None else None,
                        "trend_score": float(trend) if trend is not None else None,
                        "analysis_confidence_score": float(ac_conf) if ac_conf is not None else None,
                        "session_quality_score": float(sq) if sq is not None else None,
                        "analysis_version": analysis_ver,
                    },
                    "interpretation": interpretation,
                },
            }

    analysis = run_analysis(images, user_id, session_id)
    overwritten = _persist_analysis(session_id, user_id, analysis)

    scores = analysis.get("scores", {})
    quality_summary = analysis.get("image_quality_summary", {})
    interpretation = _interpretation_payload(
        user_id,
        float(scores.get("overall_change_score", 0.0)),
        scores.get("angle_aware_score"),
        scores.get("analysis_confidence_score"),
    )
    return {
        "success": True,
        "data": {
            "session_id": session_id,
            "overwritten": overwritten,
            "from_cache": False,
            "is_first_session": scores.get("is_first_session", False),
            "session_analysis": {
                "per_angle": analysis["per_angle"],
                "overall_summary": analysis["overall_summary"],
            },
            "scores": {
                "change_score": scores.get("overall_change_score", 0.0),
                "variation_level": scores.get("variation_level"),
                "angle_aware_score": scores.get("angle_aware_score"),
                "angle_aware_variation_level": scores.get("angle_aware_variation_level"),
                "trend_score": scores.get("trend_score"),
                "analysis_confidence_score": scores.get("analysis_confidence_score"),
                "session_quality_score": scores.get("session_quality_score"),
                "analysis_version": scores.get("analysis_version"),
            },
            "interpretation": interpretation,
            "localized_insights": analysis.get("localized_insights") or [],
            # Part 7: trust and transparency fields
            "image_quality_summary": quality_summary,
            "baseline_used": analysis.get("baseline_used"),
            "comparison_layers_used": analysis.get("comparison_layers_used", []),
            "processing_time_ms": analysis.get("processing_time_ms"),
        },
    }
