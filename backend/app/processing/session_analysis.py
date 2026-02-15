from typing import Dict, List


def compute_session_scores(embeddings: List[List[float]]) -> Dict[str, float]:
    # TODO: Replace with real scoring logic
    if not embeddings:
        return {"overall_change_score": 0.0}

    return {"overall_change_score": 0.1}
