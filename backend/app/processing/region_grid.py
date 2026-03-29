"""
Deterministic 3×3 grid over the final 224×224 preprocessed image.
Indices are row-major: region_index = row * 3 + col (0 = top-left, 8 = bottom-right).
"""

from __future__ import annotations

from typing import List, Tuple

import cv2
import numpy as np

GRID = 3
TARGET = 224

# 75 + 75 + 74 = 224 (deterministic, stable across sessions)
_SPLIT_H = (75, 75, 74)
_SPLIT_W = (75, 75, 74)


def region_rc(region_index: int) -> Tuple[int, int]:
    if not 0 <= region_index < 9:
        raise ValueError("region_index must be 0..8")
    return region_index // GRID, region_index % GRID


def split_regions_224(image: np.ndarray) -> List[np.ndarray]:
    """
    Split a 224×224 RGB float32 [0,1] image into 9 patches, each resized to 224×224
    for the embedding model.
    """
    if image.shape[0] != TARGET or image.shape[1] != TARGET:
        raise ValueError(f"Expected {TARGET}×{TARGET} image, got {image.shape[:2]}")
    if image.shape[2] != 3:
        raise ValueError("Expected RGB image")

    patches: List[np.ndarray] = []
    r0 = 0
    for i in range(GRID):
        c0 = 0
        for j in range(GRID):
            h, w = _SPLIT_H[i], _SPLIT_W[j]
            patch = image[r0 : r0 + h, c0 : c0 + w, :]
            u8 = (np.clip(patch, 0.0, 1.0) * 255.0).astype(np.uint8)
            resized = cv2.resize(u8, (TARGET, TARGET), interpolation=cv2.INTER_AREA)
            patches.append((resized.astype(np.float32) / 255.0))
            c0 += w
        r0 += h
    if len(patches) != 9:
        raise RuntimeError("grid split produced wrong patch count")
    return patches
