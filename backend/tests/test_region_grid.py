"""Tests for deterministic 3×3 region splitting on 224×224 images."""

import numpy as np

from app.processing.region_grid import (
    GRID,
    TARGET,
    region_rc,
    split_regions_224,
)


def test_region_rc_indices():
    assert region_rc(0) == (0, 0)
    assert region_rc(4) == (1, 1)
    assert region_rc(8) == (2, 2)


def test_split_nine_patches_correct_shape():
    img = np.random.rand(TARGET, TARGET, 3).astype(np.float32)
    patches = split_regions_224(img)
    assert len(patches) == GRID * GRID
    for p in patches:
        assert p.shape == (TARGET, TARGET, 3)
        assert p.dtype == np.float32
        assert p.min() >= 0 and p.max() <= 1.0


def test_split_deterministic():
    rng = np.random.default_rng(42)
    img = rng.random((TARGET, TARGET, 3)).astype(np.float32)
    a = split_regions_224(img)
    b = split_regions_224(img)
    for x, y in zip(a, b):
        assert np.allclose(x, y)
