"""
Issue #145 — Unit tests for AI preprocessing pipeline.

These tests exercise the preprocessing, quality, region_grid, and embedding
modules without GPU or network access.  All storage/model interactions are
mocked.
"""

import io
from unittest import mock

import numpy as np
import pytest
from PIL import Image

from app.processing.embedding import (
    EMBEDDING_DIM,
    compute_phash,
    extract_embedding,
    phash_hamming_distance,
)
from app.processing.preprocessing import (
    PRE_DENOISE_MAX,
    PreprocessResult,
    StorageDownloadTimeoutError,
    fast_downscale,
    load_image_from_storage,
    preprocess_pipeline,
)
from app.processing.quality import (
    BLUR_THRESHOLD,
    ImageQuality,
    compute_analysis_confidence,
    compute_consistency_score,
    compute_image_quality,
    compute_session_quality,
    variation_level,
)
from app.processing.region_grid import (
    TARGET,
    region_rc,
    split_regions_224,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_image_bytes(mode: str = "RGB", size: tuple = (224, 224)) -> bytes:
    """Create in-memory PNG/JPEG bytes from a small synthetic image."""
    arr = np.random.randint(0, 255, (*size[::-1], 3), dtype=np.uint8)
    pil_img = Image.fromarray(arr, mode="RGB")
    buf = io.BytesIO()
    fmt = "PNG" if mode.lower() == "png" else "JPEG"
    pil_img.save(buf, format=fmt)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# preprocess_pipeline
# ---------------------------------------------------------------------------

class TestPreprocessPipeline:
    def test_valid_synthetic_image(self):
        img = np.random.rand(224, 224, 3).astype(np.float32)
        quality = compute_image_quality(img)
        result = PreprocessResult(image=img, quality=quality)

        assert isinstance(result, PreprocessResult)
        assert result.image.shape == (224, 224, 3)
        assert result.image.dtype == np.float32
        assert isinstance(result.quality, ImageQuality)
        assert 0.0 <= result.quality.quality_score <= 1.0

    def test_none_input_rejected(self):
        with pytest.raises((ValueError, AttributeError, TypeError)):
            _ = fast_downscale(None)

    def test_empty_input_rejected(self):
        empty = np.array([])
        with pytest.raises((ValueError, IndexError)):
            _ = fast_downscale(empty)

    def test_wrong_dimensions_rejected(self):
        gray = np.random.rand(224, 224).astype(np.float32)
        with pytest.raises((ValueError, IndexError)):
            _ = split_regions_224(gray)

    def test_result_structure(self):
        img = np.random.rand(224, 224, 3).astype(np.float32)
        q = compute_image_quality(img)
        result = PreprocessResult(image=img, quality=q)
        assert hasattr(result, "image")
        assert hasattr(result, "quality")
        assert result.quality.blur_score >= 0.0
        assert 0.0 <= result.quality.brightness <= 1.0


# ---------------------------------------------------------------------------
# load_image_from_storage
# ---------------------------------------------------------------------------

class TestLoadImageFromStorage:
    def _mock_supabase(self, response_bytes: bytes):
        storage_mock = mock.MagicMock()
        storage_mock.from_.return_value.download.return_value = response_bytes
        client_mock = mock.MagicMock()
        client_mock.storage = storage_mock
        return client_mock, storage_mock

    @mock.patch("app.processing.preprocessing.signal.signal")
    @mock.patch("app.processing.preprocessing.signal.alarm")
    def test_load_png(self, mock_alarm, mock_signal):
        data = _make_image_bytes("png")
        client, storage = self._mock_supabase(data)
        result = load_image_from_storage("test.png", client)

        assert isinstance(result, np.ndarray)
        assert result.ndim == 3
        assert result.shape[2] == 3
        assert result.dtype == np.uint8
        storage.from_.assert_called_once_with("bcd-images")

    @mock.patch("app.processing.preprocessing.signal.signal")
    @mock.patch("app.processing.preprocessing.signal.alarm")
    def test_load_jpeg(self, mock_alarm, mock_signal):
        data = _make_image_bytes("jpeg")
        client, storage = self._mock_supabase(data)
        result = load_image_from_storage("test.jpg", client)

        assert isinstance(result, np.ndarray)
        assert result.shape[2] == 3
        assert result.dtype == np.uint8

    @mock.patch("app.processing.preprocessing.signal.signal")
    @mock.patch("app.processing.preprocessing.signal.alarm")
    def test_unsupported_format_raises_value_error(self, mock_alarm, mock_signal):
        client, _ = self._mock_supabase(b"NOTANIMAGE12345678")
        with pytest.raises(ValueError, match="Unsupported image format"):
            load_image_from_storage("test.bmp", client)

    @mock.patch("app.processing.preprocessing.signal.signal")
    @mock.patch("app.processing.preprocessing.signal.alarm")
    def test_download_timeout_raises_storage_error(self, mock_alarm, mock_signal):
        def _raise_timeout(*args, **kwargs):
            raise StorageDownloadTimeoutError("timed out")

        client = mock.MagicMock()
        client.storage.from_.return_value.download.side_effect = _raise_timeout

        with pytest.raises(StorageDownloadTimeoutError):
            load_image_from_storage("test.png", client)


# ---------------------------------------------------------------------------
# fast_downscale
# ---------------------------------------------------------------------------

class TestFastDownscale:
    def test_no_op_for_small_image(self):
        img = np.random.randint(0, 255, (480, 360, 3), dtype=np.uint8)
        result = fast_downscale(img)

        assert result is img
        assert max(result.shape[:2]) <= PRE_DENOISE_MAX

    def test_downscales_large_image(self):
        img = np.random.randint(0, 255, (4000, 3000, 3), dtype=np.uint8)
        result = fast_downscale(img)

        h, w = result.shape[:2]
        assert max(h, w) <= PRE_DENOISE_MAX
        assert result.ndim == 3
        assert result.shape[2] == 3


# ---------------------------------------------------------------------------
# Quality functions
# ---------------------------------------------------------------------------

class TestQualityFunctions:
    def _make_sharp_image(self):
        rng = np.random.default_rng(1)
        return (rng.random((224, 224, 3))).astype(np.float32)

    def _make_blurry_image(self):
        return np.full((224, 224, 3), 0.5, dtype=np.float32)

    def _make_bright_image(self):
        return np.full((224, 224, 3), 0.95, dtype=np.float32)

    def _make_dark_image(self):
        return np.full((224, 224, 3), 0.02, dtype=np.float32)

    def test_blur_detection_sharp_vs_blurry(self):
        sharp_q = compute_image_quality(self._make_sharp_image())
        blurry_q = compute_image_quality(self._make_blurry_image())

        assert sharp_q.blur_score > blurry_q.blur_score
        assert blurry_q.is_blurry
        assert not sharp_q.is_blurry

    def test_brightness_detection_bright_vs_dark(self):
        bright_q = compute_image_quality(self._make_bright_image())
        dark_q = compute_image_quality(self._make_dark_image())

        assert bright_q.brightness > dark_q.brightness
        assert bright_q.is_too_bright
        assert dark_q.is_too_dark

    def test_quality_score_in_zero_one(self):
        for img_fn in (
            self._make_sharp_image,
            self._make_blurry_image,
            self._make_bright_image,
            self._make_dark_image,
        ):
            q = compute_image_quality(img_fn())
            assert 0.0 <= q.quality_score <= 1.0

    @pytest.mark.parametrize(
        "score,expected",
        [
            (0.0, "Stable"),
            (0.15, "Mild Variation"),
            (0.35, "Moderate Variation"),
            (0.55, "Higher Variation"),
            (0.85, "Strong Variation"),
        ],
    )
    def test_variation_level_categories(self, score, expected):
        assert variation_level(score) == expected


# ---------------------------------------------------------------------------
# split_regions_224 / region_rc
# ---------------------------------------------------------------------------

class TestRegionGrid:
    def test_split_regions_returns_nine_patches(self):
        img = np.random.rand(TARGET, TARGET, 3).astype(np.float32)
        patches = split_regions_224(img)

        assert len(patches) == 9
        for patch in patches:
            assert patch.shape == (TARGET, TARGET, 3)
            assert patch.dtype == np.float32
            assert 0.0 <= patch.min() and patch.max() <= 1.0

    @pytest.mark.parametrize(
        "bad_shape",
        [
            (224, 224),
            (300, 300, 3),
            (224, 224, 1),
        ],
    )
    def test_split_regions_invalid_dimensions(self, bad_shape):
        img = np.random.rand(*bad_shape).astype(np.float32)
        with pytest.raises((ValueError, IndexError)):
            split_regions_224(img)

    @pytest.mark.parametrize(
        "index,expected",
        [
            (0, (0, 0)),
            (4, (1, 1)),
            (8, (2, 2)),
        ],
    )
    def test_region_rc_valid_indices(self, index, expected):
        assert region_rc(index) == expected

    @pytest.mark.parametrize("index", [-1, 9, 100])
    def test_region_rc_invalid_index(self, index):
        with pytest.raises(ValueError):
            region_rc(index)


# ---------------------------------------------------------------------------
# pHash functions
# ---------------------------------------------------------------------------

class TestPHashFunctions:
    def test_compute_phash_returns_hex_string(self):
        img = np.random.rand(224, 224, 3).astype(np.float32)
        h = compute_phash(img)
        assert isinstance(h, str)
        assert len(h) == 16
        assert int(h, 16) >= 0

    def test_compute_phash_is_deterministic(self):
        img = np.random.rand(224, 224, 3).astype(np.float32)
        h1 = compute_phash(img)
        h2 = compute_phash(img)
        assert h1 == h2

    def test_phash_hamming_distance_non_negative_int(self):
        img_a = np.random.rand(224, 224, 3).astype(np.float32)
        img_b = np.random.rand(224, 224, 3).astype(np.float32)
        ha = compute_phash(img_a)
        hb = compute_phash(img_b)
        dist = phash_hamming_distance(ha, hb)
        assert isinstance(dist, int)
        assert dist >= 0


# ---------------------------------------------------------------------------
# extract_embedding (mocked model loading)
# ---------------------------------------------------------------------------

class TestExtractEmbedding:
    @mock.patch("app.processing.embedding.get_encoder")
    def test_extract_embedding_mocks_onnx_model(
        self,
        mock_get_encoder,
    ):
        fake_embedding = np.random.rand(EMBEDDING_DIM).astype(np.float32)

        fake_session = mock.MagicMock()
        fake_session.run.return_value = [fake_embedding.reshape(1, -1)]

        fake_encoder = mock.MagicMock()
        fake_encoder.extract.return_value = fake_embedding
        fake_encoder.extract_batch.return_value = fake_embedding.reshape(1, -1)
        mock_get_encoder.return_value = fake_encoder

        from app.processing.embedding import extract_embedding

        img = np.random.rand(224, 224, 3).astype(np.float32)
        emb = extract_embedding(img)
        assert emb.shape == (EMBEDDING_DIM,)
        assert emb.dtype == np.float32
        np.testing.assert_array_equal(emb, fake_embedding)
