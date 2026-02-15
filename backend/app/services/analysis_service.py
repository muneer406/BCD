from typing import Dict, List

from ..processing.embedding import extract_embedding
from ..processing.preprocessing import crop_region_of_interest, normalize_image, resize
from ..processing.session_analysis import compute_session_scores


def _score_from_embedding(embedding: List[float]) -> float:
    if not embedding:
        return 0.0
    sample = embedding[:8]
    return min(1.0, max(0.0, sum(sample) / len(sample)))


def analyze_session(images: List[dict]) -> Dict[str, object]:
    embeddings: List[List[float]] = []
    per_angle_results: List[Dict[str, object]] = []

    for image in images:
        raw_image = image.get("storage_path", "")
        processed = normalize_image(raw_image)
        processed = crop_region_of_interest(processed)
        processed = resize(processed, (512, 512))

        embedding = extract_embedding(processed)
        embeddings.append(embedding)

        per_angle_results.append(
            {
                "angle_type": image.get("image_type"),
                "change_score": _score_from_embedding(embedding),
                "summary": "Placeholder analysis completed for this angle.",
            }
        )

    scores = compute_session_scores(embeddings)

    return {
        "per_angle": per_angle_results,
        "overall_summary": "Placeholder session analysis completed.",
        "scores": scores,
    }
