"""
BCD Backend - embedding.py
Feature extraction using ONNX Runtime with MobileNetV3-Small (576-dim).
Replaces the previous PyTorch+EfficientNetV2-S pipeline for lighter memory.

Model: mobilenetv3_small_embedding_int8.onnx (576-dim output, int8 quantized).
Weights: Downloaded from GitHub Releases at startup.
"""

import logging
import os
from typing import List

import numpy as np
import onnxruntime

from PIL import Image

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 576
TARGET_SIZE = 224

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# Model singleton
_encoder: "OnnxEncoder | None" = None
_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "models",
                           "mobilenetv3_small_embedding.onnx")


class OnnxEncoder:
    """MobileNetV3-Small via ONNX Runtime for 576-dim embedding extraction."""

    def __init__(self) -> None:
        path = os.path.abspath(_MODEL_PATH)
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"ONNX model not found at {path}. "
                "Run the startup download or place the model file."
            )
        so = onnxruntime.SessionOptions()
        so.log_severity_level = 3
        self.session = onnxruntime.InferenceSession(
            path, sess_options=so,
            providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        logger.info("ONNX model loaded from %s (576-dim, %s)",
                     path, self.session.get_inputs()[0].type)

    def _preprocess(self, image: np.ndarray) -> np.ndarray:
        """float32 [0,1] HWC RGB -> (1, 3, 224, 224) BCHW normalized."""
        # Resize
        h, w = image.shape[:2]
        if h != TARGET_SIZE or w != TARGET_SIZE:
            pil = Image.fromarray((image * 255).astype(np.uint8))
            pil = pil.resize((TARGET_SIZE, TARGET_SIZE), 2)
            image = np.array(pil).astype(np.float32) / 255.0
        # Normalize
        image = (image - IMAGENET_MEAN) / IMAGENET_STD
        # HWC -> BCHW
        return image.transpose(2, 0, 1)[np.newaxis, ...].astype(np.float32)

    def extract(self, image: np.ndarray) -> np.ndarray:
        """Single image: float32 [0,1] HWC RGB -> 576-dim vector."""
        tensor = self._preprocess(image)
        embedding = self.session.run(None, {self.input_name: tensor})[0]
        return embedding.flatten().astype(np.float32)

    def extract_batch(self, images: List[np.ndarray]) -> np.ndarray:
        """N images -> (N, 576) matrix."""
        tensors = [self._preprocess(img) for img in images]
        batch = np.concatenate(tensors, axis=0)
        embeddings = self.session.run(None, {self.input_name: batch})[0]
        return embeddings.astype(np.float32)


def get_encoder() -> OnnxEncoder:
    global _encoder
    if _encoder is None:
        _encoder = OnnxEncoder()
    return _encoder


def extract_embedding(image: np.ndarray) -> np.ndarray:
    encoder = get_encoder()
    return encoder.extract(image)


def extract_embeddings_batch(images: List[np.ndarray]) -> np.ndarray:
    encoder = get_encoder()
    return encoder.extract_batch(images)


# pHash fast pre-check (hybrid approach)

def compute_phash(image: np.ndarray) -> str:
    import imagehash
    img_uint8 = (image * 255).astype(np.uint8)
    pil_img = Image.fromarray(img_uint8)
    return str(imagehash.phash(pil_img))


def phash_hamming_distance(hash_a: str, hash_b: str) -> int:
    import imagehash
    return imagehash.hex_to_hash(hash_a) - imagehash.hex_to_hash(hash_b)
