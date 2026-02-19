"""
Phase 5 unit tests — quality scoring, preprocessing, and variation level.
These are pure unit tests with no DB or storage calls.
"""

import numpy as np
import pytest

from app.processing.quality import (
    BLUR_THRESHOLD,
    BRIGHTNESS_HIGH,
    BRIGHTNESS_LOW,
    ImageQuality,
    compute_analysis_confidence,
    compute_consistency_score,
    compute_image_quality,
    compute_session_quality,
    variation_level,
)
from app.processing.preprocessing import (
    PreprocessResult,
    align_image,
    normalize_image,
    resize_image,
)


# ---------------------------------------------------------------------------
# variation_level
# ---------------------------------------------------------------------------

class TestVariationLevel:
    @pytest.mark.parametrize("score,expected", [
        (0.00, "Stable"),
        (0.05, "Stable"),
        (0.099, "Stable"),
        (0.10, "Mild Variation"),
        (0.20, "Mild Variation"),
        (0.249, "Mild Variation"),
        (0.25, "Moderate Variation"),
        (0.30, "Moderate Variation"),
        (0.449, "Moderate Variation"),
        (0.45, "Higher Variation"),
        (0.60, "Higher Variation"),
        (0.699, "Higher Variation"),
        (0.70, "Strong Variation"),
        (0.85, "Strong Variation"),
        (1.00, "Strong Variation"),
    ])
    def test_mapping(self, score, expected):
        assert variation_level(score) == expected

    def test_no_medical_language(self):
        """Ensure no prohibited words appear in any variation level label."""
        prohibited = {"risk", "abnormal", "suspicious", "concerning"}
        all_levels = [
            variation_level(s) for s in [0.0, 0.15, 0.35, 0.55, 0.80]
        ]
        for level in all_levels:
            for word in prohibited:
                assert word.lower() not in level.lower(), \
                    f"Prohibited word '{word}' found in '{level}'"


# ---------------------------------------------------------------------------
# compute_image_quality
# ---------------------------------------------------------------------------

class TestComputeImageQuality:
    def _make_sharp_image(self):
        """Random noise image — high Laplacian variance = sharp."""
        return (np.random.rand(224, 224, 3) * 255).astype(np.uint8).astype(np.float32) / 255.0

    def _make_blurry_image(self):
        """Uniform colour — zero Laplacian variance = blurry."""
        return np.full((224, 224, 3), 0.5, dtype=np.float32)

    def _make_dark_image(self):
        return np.zeros((224, 224, 3), dtype=np.float32) + 0.01

    def _make_bright_image(self):
        return np.ones((224, 224, 3), dtype=np.float32) * 0.99

    def test_sharp_image_high_quality(self):
        q = compute_image_quality(self._make_sharp_image())
        assert isinstance(q, ImageQuality)
        assert q.quality_score > 0.5
        assert not q.is_blurry

    def test_blurry_image_is_flagged(self):
        q = compute_image_quality(self._make_blurry_image())
        assert q.is_blurry
        assert q.blur_score < BLUR_THRESHOLD

    def test_dark_image_is_flagged(self):
        q = compute_image_quality(self._make_dark_image())
        assert q.is_too_dark
        assert q.brightness < BRIGHTNESS_LOW

    def test_bright_image_is_flagged(self):
        q = compute_image_quality(self._make_bright_image())
        assert q.is_too_bright
        assert q.brightness > BRIGHTNESS_HIGH

    def test_quality_score_bounds(self):
        for _ in range(5):
            q = compute_image_quality(self._make_sharp_image())
            assert 0.0 <= q.quality_score <= 1.0

    def test_brightness_bounds(self):
        q = compute_image_quality(self._make_sharp_image())
        assert 0.0 <= q.brightness <= 1.0


# ---------------------------------------------------------------------------
# compute_session_quality
# ---------------------------------------------------------------------------

class TestComputeSessionQuality:
    def test_full_coverage(self):
        scores = {f"angle{i}": 0.8 for i in range(6)}
        sq = compute_session_quality(scores)
        assert sq == pytest.approx(0.8, rel=1e-3)

    def test_partial_coverage_penalised(self):
        full = compute_session_quality({f"a{i}": 0.8 for i in range(6)})
        partial = compute_session_quality({f"a{i}": 0.8 for i in range(3)})
        assert partial < full

    def test_empty_returns_zero(self):
        assert compute_session_quality({}) == 0.0

    def test_bounds(self):
        sq = compute_session_quality({"front": 0.5, "left": 0.5})
        assert 0.0 <= sq <= 1.0


# ---------------------------------------------------------------------------
# compute_consistency_score
# ---------------------------------------------------------------------------

class TestComputeConsistencyScore:
    def test_identical_scores_are_perfectly_consistent(self):
        assert compute_consistency_score([0.5, 0.5, 0.5]) == pytest.approx(1.0)

    def test_high_variance_gives_low_consistency(self):
        cs = compute_consistency_score([0.0, 0.5, 1.0])
        assert cs < 0.5

    def test_single_score_returns_one(self):
        assert compute_consistency_score([0.7]) == pytest.approx(1.0)

    def test_empty_returns_one(self):
        assert compute_consistency_score([]) == pytest.approx(1.0)

    def test_bounds(self):
        cs = compute_consistency_score([0.1, 0.9])
        assert 0.0 <= cs <= 1.0


# ---------------------------------------------------------------------------
# compute_analysis_confidence
# ---------------------------------------------------------------------------

class TestComputeAnalysisConfidence:
    def test_returning_user_higher_than_first(self):
        conf_first = compute_analysis_confidence(0.8, 0.9, 6, is_first_session=True)
        conf_return = compute_analysis_confidence(0.8, 0.9, 6, is_first_session=False)
        assert conf_return > conf_first

    def test_full_coverage_higher_than_partial(self):
        full = compute_analysis_confidence(0.8, 0.9, 6, False)
        partial = compute_analysis_confidence(0.8, 0.9, 3, False)
        assert full > partial

    def test_high_quality_higher_than_low(self):
        high = compute_analysis_confidence(0.9, 0.9, 6, False)
        low = compute_analysis_confidence(0.3, 0.9, 6, False)
        assert high > low

    def test_bounds(self):
        c = compute_analysis_confidence(0.6, 0.7, 4, False)
        assert 0.0 <= c <= 1.0

    def test_perfect_scenario(self):
        c = compute_analysis_confidence(1.0, 1.0, 6, False)
        assert c == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# PreprocessResult dataclass
# ---------------------------------------------------------------------------

class TestPreprocessResult:
    def test_holds_image_and_quality(self):
        img = np.random.rand(224, 224, 3).astype(np.float32)
        q = ImageQuality(
            blur_score=500.0, brightness=0.5,
            is_blurry=False, is_too_dark=False, is_too_bright=False,
            quality_score=0.85
        )
        pr = PreprocessResult(image=img, quality=q)
        assert pr.image.shape == (224, 224, 3)
        assert pr.quality.quality_score == 0.85


# ---------------------------------------------------------------------------
# Preprocessing pipeline steps (unit, no storage)
# ---------------------------------------------------------------------------

class TestPreprocessingSteps:
    def _make_uint8(self, h=300, w=250):
        return (np.random.rand(h, w, 3) * 255).astype(np.uint8)

    def test_normalize_image_output_range(self):
        img = self._make_uint8()
        result = normalize_image(img)
        assert result.dtype == np.float32
        assert result.min() >= 0.0
        assert result.max() <= 1.0

    def test_align_image_produces_square(self):
        img = np.random.rand(300, 250, 3).astype(np.float32)
        aligned = align_image(img)
        h, w = aligned.shape[:2]
        assert h == w == 250  # min(300, 250) = 250

    def test_resize_image_to_target(self):
        img = np.random.rand(250, 250, 3).astype(np.float32)
        resized = resize_image(img)
        assert resized.shape == (224, 224, 3)

    def test_normalize_align_resize_pipeline(self):
        img_uint8 = self._make_uint8(300, 280)
        normed = normalize_image(img_uint8)
        aligned = align_image(normed)
        resized = resize_image(aligned)
        assert resized.shape == (224, 224, 3)
        assert resized.dtype == np.float32
