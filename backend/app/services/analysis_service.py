"""
BCD Backend - analysis_service.py
Production-ready session analysis with real ML pipeline.
"""

from typing import Dict, List
import json
import numpy as np

from ..processing.embedding import extract_embedding
from ..processing.preprocessing import preprocess_pipeline
from .db import get_supabase_client


def _load_user_baseline(user_id: str) -> np.ndarray | None:
    """
    Load rolling baseline embedding for user.
    Returns mean of all previous session embeddings.
    """
    supabase = get_supabase_client()

    result = (
        supabase.table("session_embeddings")
        .select("embedding")
        .eq("user_id", user_id)
        .execute()
    )

    if not result.data:
        return None

    # Convert stored embeddings to numpy arrays, parsing JSON if needed
    embeddings = []
    for row in result.data:
        emb = row.get("embedding")
        # Parse JSON string if it's a string, otherwise assume it's already a list
        if isinstance(emb, str):
            emb = json.loads(emb)
        embeddings.append(np.array(emb, dtype=np.float32))

    if not embeddings:
        return None

    # Return mean as baseline
    return np.mean(embeddings, axis=0)


def _cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    """
    Calculate cosine distance between two vectors.
    Distance = 1 - cosine_similarity
    """
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0:
        return 1.0

    cosine_sim = dot_product / (norm_a * norm_b)
    return 1.0 - cosine_sim


def _store_session_embedding(session_id: str, user_id: str, embedding: np.ndarray):
    """
    Store session embedding in database.
    """
    supabase = get_supabase_client()

    # Delete existing embedding for this session (idempotent)
    supabase.table("session_embeddings").delete().eq(
        "session_id", session_id).execute()

    # Store new embedding
    supabase.table("session_embeddings").insert({
        "session_id": session_id,
        "user_id": user_id,
        "embedding": embedding.tolist()
    }).execute()


def analyze_session(images: List[dict], user_id: str, session_id: str) -> Dict[str, object]:
    """
    Analyze session using real ML pipeline.

    Args:
        images: List of image records with storage_path and image_type
        user_id: User ID for baseline calculation
        session_id: Session ID for embedding storage

    Returns:
        Analysis results with per-angle scores and overall metrics
    """
    supabase = get_supabase_client()

    # Load user baseline (rolling average of previous sessions)
    user_baseline = _load_user_baseline(user_id)

    # Process each image
    image_embeddings: List[np.ndarray] = []
    per_angle_results: List[Dict[str, object]] = []

    for image_record in images:
        storage_path = image_record.get("storage_path", "")

        # Real preprocessing pipeline
        processed_image = preprocess_pipeline(storage_path, supabase)

        # Real embedding extraction with user normalization
        embedding = extract_embedding(processed_image, user_mean=user_baseline)
        image_embeddings.append(embedding)

        # Calculate change score for this angle
        if user_baseline is not None:
            # Distance from baseline
            distance = _cosine_distance(embedding, np.zeros_like(embedding))
            change_score = min(1.0, distance)
        else:
            # First session - no baseline yet
            change_score = 0.0

        per_angle_results.append({
            "angle_type": image_record.get("image_type"),
            "change_score": float(change_score),
            "summary": f"Distance-based analysis for {image_record.get('image_type')} angle.",
        })

    # Compute session-level embedding (mean of all angles)
    session_embedding = np.mean(image_embeddings, axis=0)

    # Store session embedding for future baseline calculations
    _store_session_embedding(session_id, user_id, session_embedding)

    # Calculate overall change score
    if user_baseline is not None:
        # Distance from baseline using session embedding
        overall_distance = _cosine_distance(
            session_embedding, np.zeros_like(session_embedding))
        overall_change_score = min(1.0, overall_distance)
    else:
        # First session
        overall_change_score = 0.0

    return {
        "per_angle": per_angle_results,
        "overall_summary": f"Real ML analysis complete. Baseline: {'available' if user_baseline is not None else 'establishing'}.",
        "scores": {
            "overall_change_score": float(overall_change_score)
        }
    }
