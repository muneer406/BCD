"""
Region-based localized copy for BCD. Non-diagnostic, observational language only.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np

from ..processing.region_grid import region_rc

REGION_SCORE_THRESHOLD = 0.35
TOP_REGIONS = 3
ASYMMETRY_DELTA_THRESHOLD = 0.18
ASYMMETRY_MIN_DISTANCE = 0.28


def _cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 1.0
    return float(1.0 - np.dot(a, b) / (norm_a * norm_b))


def _angle_view_label(angle_type: str) -> str:
    return {
        "front": "front view",
        "left": "left-side view",
        "right": "right-side view",
        "up": "upward-angle view",
        "down": "downward-angle view",
        "raised": "full-body view",
    }.get(angle_type, f"{angle_type} view")


def _region_location_phrase(angle_type: str, region_index: int) -> str:
    """Map grid cell to a neutral spatial phrase (no medical claims)."""
    row, col = region_rc(region_index)
    vert = ("upper", "middle", "lower")[row]

    if angle_type == "front":
        horiz = ("left", "center", "right")[col]
        return f"{vert} {horiz} area of the {_angle_view_label(angle_type)}"
    if angle_type == "left":
        depth = ("forward part", "middle", "back part")[col]
        return f"{vert} {depth} of the {_angle_view_label(angle_type)}"
    if angle_type == "right":
        depth = ("forward part", "middle", "back part")[col]
        return f"{vert} {depth} of the {_angle_view_label(angle_type)}"
    if angle_type in ("up", "down", "raised"):
        horiz = ("left", "center", "right")[col]
        return f"{vert} {horiz} area of the {_angle_view_label(angle_type)}"
    return f"region {region_index + 1} of the {_angle_view_label(angle_type)}"


def _comparison_phrase(has_baseline: bool, has_last: bool) -> str:
    if has_baseline and has_last:
        return "compared to your baseline and your last session"
    if has_baseline:
        return "compared to your baseline"
    if has_last:
        return "compared to your last session"
    return "compared to your stored reference"


def build_localized_insights(
    current_regions: Dict[str, np.ndarray],
    baseline_regions: Dict[Tuple[str, int], np.ndarray],
    last_regions: Dict[Tuple[str, int], np.ndarray],
    angle_embeddings: Dict[str, np.ndarray],
    per_angle_baselines: Dict[str, np.ndarray],
    is_first_session: bool,
) -> List[str]:
    """
    Select top region differences and optional left/right asymmetry insight.

    current_regions: angle_type -> (9, dim) float32
    baseline_regions: (angle_type, region_index) -> mean embedding
    last_regions: (angle_type, region_index) -> embedding from immediate prior session
    """
    if is_first_session:
        return []

    insights: List[str] = []
    candidates: List[Tuple[float, str, int]] = []

    for angle_type, mat in current_regions.items():
        if mat.shape[0] != 9:
            continue
        for ri in range(9):
            cur = mat[ri]
            key = (angle_type, ri)
            scores: List[float] = []
            if key in baseline_regions:
                scores.append(_cosine_distance(cur, baseline_regions[key]))
            if key in last_regions:
                scores.append(_cosine_distance(cur, last_regions[key]))
            if not scores:
                continue
            s = max(scores)
            if s > REGION_SCORE_THRESHOLD:
                candidates.append((s, angle_type, ri))

    candidates.sort(key=lambda x: -x[0])
    for _, angle_type, ri in candidates:
        if len(insights) >= TOP_REGIONS:
            break
        loc_phrase = _region_location_phrase(angle_type, ri)
        has_b = (angle_type, ri) in baseline_regions
        has_l = (angle_type, ri) in last_regions
        cmp_phr = _comparison_phrase(has_b, has_l)
        insights.append(
            f"A noticeable difference was observed in the {loc_phrase} {cmp_phr}."
        )

    # Left vs right full-angle asymmetry (embedding space), relative to baseline pair
    left_e = angle_embeddings.get("left")
    right_e = angle_embeddings.get("right")
    bl = per_angle_baselines.get("left")
    br = per_angle_baselines.get("right")
    if (
        left_e is not None
        and right_e is not None
        and bl is not None
        and br is not None
    ):
        cur_asym = _cosine_distance(left_e, right_e)
        base_asym = _cosine_distance(bl, br)
        if (
            abs(cur_asym - base_asym) > ASYMMETRY_DELTA_THRESHOLD
            and max(cur_asym, base_asym) > ASYMMETRY_MIN_DISTANCE
        ):
            insights.append(
                "The left-side and right-side captures show a different balance "
                "between them than in your baseline reference."
            )

    return insights[: TOP_REGIONS + 1]
