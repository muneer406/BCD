"""
BCD Backend - quality.py
Phase 5: Image quality scoring — blur detection, brightness assessment,
         consistency scoring, and analysis confidence.

NO diagnosis, classification, or medical prediction.
"""

from dataclasses import dataclass
from typing import Dict, List

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

BLUR_THRESHOLD = 80.0       # Laplacian variance — below = blurry
BRIGHTNESS_LOW = 0.15       # Mean normalised brightness — below = too dark
BRIGHTNESS_HIGH = 0.90      # Mean normalised brightness — above = overexposed
BLUR_REFERENCE = 5.0 * BLUR_THRESHOLD   # Normalisation ceiling for blur score


# ---------------------------------------------------------------------------
# Per-image quality
# ---------------------------------------------------------------------------

@dataclass
class ImageQuality:
    blur_score: float       # Laplacian variance (higher = sharper)
    brightness: float       # Mean pixel value in [0, 1]
    is_blurry: bool
    is_too_dark: bool
    is_too_bright: bool
    quality_score: float    # Composite [0, 1]; 1 = perfect


def compute_image_quality(image: np.ndarray) -> ImageQuality:
    """
    Compute blur and brightness quality metrics for a preprocessed image.

    `image` must be float32 in [0, 1] (output of preprocess_pipeline).

    Blur component    (60 %): normalised Laplacian variance — cap at 5× threshold.
    Brightness component (40 %): distance from ideal mid-brightness (0.5),
                                  normalised to [0, 1].
    """
    img_uint8 = (np.clip(image, 0.0, 1.0) * 255).astype(np.uint8)
    gray = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2GRAY)

    # Sharpness: Laplacian variance
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    # Brightness: mean of grayscale channel
    brightness = float(gray.mean() / 255.0)

    is_blurry = blur_score < BLUR_THRESHOLD
    is_too_dark = brightness < BRIGHTNESS_LOW
    is_too_bright = brightness > BRIGHTNESS_HIGH

    # Composite score
    blur_component = min(1.0, blur_score / BLUR_REFERENCE)
    brightness_penalty = abs(brightness - 0.5) / 0.5   # 0 = ideal, 1 = extreme
    brightness_component = 1.0 - brightness_penalty

    quality_score = 0.6 * blur_component + 0.4 * brightness_component
    quality_score = float(max(0.0, min(1.0, quality_score)))

    return ImageQuality(
        blur_score=round(blur_score, 4),
        brightness=round(brightness, 4),
        is_blurry=is_blurry,
        is_too_dark=is_too_dark,
        is_too_bright=is_too_bright,
        quality_score=round(quality_score, 4),
    )


# ---------------------------------------------------------------------------
# Aggregation across angles / session
# ---------------------------------------------------------------------------

def compute_session_quality(angle_quality_scores: Dict[str, float]) -> float:
    """
    Aggregate per-angle quality scores into a session-level score.

    Penalises incomplete sessions (expected 6 angles).
    """
    if not angle_quality_scores:
        return 0.0
    scores = list(angle_quality_scores.values())
    mean_quality = float(np.mean(scores))
    coverage = min(1.0, len(scores) / 6.0)
    return round(mean_quality * coverage, 4)


def compute_consistency_score(angle_change_scores: List[float]) -> float:
    """
    Measures how consistent change scores are across angles.

    Low standard deviation → high consistency → 1.0.
    Normalised against a practical max std of 0.5.
    """
    if len(angle_change_scores) < 2:
        return 1.0
    std = float(np.std(angle_change_scores))
    consistency = max(0.0, 1.0 - (std / 0.5))
    return round(consistency, 4)


def compute_analysis_confidence(
    session_quality_score: float,
    consistency_score: float,
    n_angles: int,
    is_first_session: bool,
) -> float:
    """
    Compute overall analysis confidence score [0, 1].

    Weights:
      40 % — session image quality
      30 % — angle-score consistency
      20 % — coverage (n_angles / 6)
      10 % — history factor (reduced for first session — no baseline)
    """
    coverage_factor = min(1.0, n_angles / 6.0)
    history_factor = 0.7 if is_first_session else 1.0

    confidence = (
        0.40 * session_quality_score
        + 0.30 * consistency_score
        + 0.20 * coverage_factor
        + 0.10 * history_factor
    )
    return round(max(0.0, min(1.0, confidence)), 4)


# ---------------------------------------------------------------------------
# Scoring interpretation (Part 3)
# ---------------------------------------------------------------------------

def variation_level(score: float) -> str:
    """
    Map a raw cosine distance score to a neutral interpretation label.

    0.00 – 0.10 → Stable
    0.10 – 0.25 → Mild Variation
    0.25 – 0.45 → Moderate Variation
    0.45 – 0.70 → Higher Variation
    0.70 – 1.00 → Strong Variation

    Never uses: risk, abnormal, suspicious, concerning.
    """
    if score < 0.10:
        return "Stable"
    if score < 0.25:
        return "Mild Variation"
    if score < 0.45:
        return "Moderate Variation"
    if score < 0.70:
        return "Higher Variation"
    return "Strong Variation"
