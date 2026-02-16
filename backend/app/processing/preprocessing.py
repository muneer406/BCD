"""
BCD Backend - preprocessing.py
Production-ready image loading, normalization, alignment, and resizing.
"""

import io
import numpy as np
import cv2
from PIL import Image
from supabase import Client

TARGET_SIZE = (224, 224)


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


def preprocess_pipeline(storage_path: str, supabase: Client) -> np.ndarray:
    """
    Full preprocessing pipeline.
    """
    image = load_image_from_storage(storage_path, supabase)
    image = normalize_image(image)
    image = align_image(image)
    image = resize_image(image)

    return image
