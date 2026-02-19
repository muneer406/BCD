"""
BCD Backend - preprocessing.py
Phase 5: Production-ready image loading, normalization, alignment, resizing,
         and quality scoring (blur + brightness).
"""

import io
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image
from supabase import Client

from .quality import ImageQuality, compute_image_quality

TARGET_SIZE = (224, 224)


@dataclass
class PreprocessResult:
    """Holds a preprocessed image together with its quality metrics."""
    image: np.ndarray
    quality: ImageQuality


def load_image_from_storage(storage_path: str, supabase: Client) -> np.ndarray:
    """
    Load image from Supabase Storage and return as numpy array (RGB).
    """
    response = supabase.storage.from_("bcd-images").download(storage_path)

    image = Image.open(io.BytesIO(response))

    if image.mode != "RGB":
        image = image.convert("RGB")

    return np.array(image)


def normalize_image(image: np.ndarray) -> np.ndarray:
    """
    Normalize lighting and pixel intensity.
    """
    image = image.astype(np.float32) / 255.0

    # Histogram equalization on Y channel
    yuv = cv2.cvtColor((image * 255).astype(np.uint8), cv2.COLOR_RGB2YUV)
    yuv[:, :, 0] = cv2.equalizeHist(yuv[:, :, 0])

    image = cv2.cvtColor(yuv, cv2.COLOR_YUV2RGB)
    image = image.astype(np.float32) / 255.0

    return image


def align_image(image: np.ndarray) -> np.ndarray:
    """
    Center crop and align image.
    """
    h, w, _ = image.shape
    min_dim = min(h, w)

    start_x = w // 2 - min_dim // 2
    start_y = h // 2 - min_dim // 2

    image = image[start_y:start_y+min_dim, start_x:start_x+min_dim]

    return image


def resize_image(image: np.ndarray, size: tuple = TARGET_SIZE) -> np.ndarray:
    """
    Resize to fixed resolution.
    """
    image = cv2.resize(image, size, interpolation=cv2.INTER_AREA)
    return image


def preprocess_pipeline(storage_path: str, supabase: Client) -> PreprocessResult:
    """
    Full preprocessing pipeline.

    Returns a PreprocessResult containing the processed image (float32, [0,1],
    224×224 RGB) and the per-image quality metrics computed AFTER normalisation
    and cropping (so the quality reflects what the embedding model actually sees).
    """
    image = load_image_from_storage(storage_path, supabase)
    image = normalize_image(image)
    image = align_image(image)
    image = resize_image(image)

    quality = compute_image_quality(image)

    return PreprocessResult(image=image, quality=quality)
