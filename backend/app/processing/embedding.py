"""
BCD Backend - embedding.py
Phase 6: Feature extraction using EfficientNetV2-S (1280-dim output).
         Also provides pHash-based fast pre-check (hybrid approach).

Model: EfficientNetV2-S (torchvision 0.14+, available in the project's
       torchvision==0.16.0 requirement).

Output: 1280-dimensional float32 vector.
        Previous ResNet50 output was 2048-dim — all stored embeddings must be
        cleared / migrated (see PHASE6_MIGRATION.sql).

Weights: ImageNet pre-trained only.  No domain-specific fine-tuned weights
         are used.  The application domain (visible-light phone photos of
         the external chest surface) has no public labelled dataset suitable
         for supervised fine-tuning.  ImageNet weights transfer adequately
         for surface-appearance embedding tasks.
"""

import logging
from typing import List

import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image

logger = logging.getLogger(__name__)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

EMBEDDING_DIM = 1280
INTERMEDIATE_SIZE = 384
TARGET_SIZE = 224

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

_transform = transforms.Compose([
    transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])

# Model singleton
_encoder: "ImageEncoder | None" = None


class ImageEncoder:
    """EfficientNetV2-S wrapped for 1280-dim embedding extraction."""

    def __init__(self) -> None:
        self.device = DEVICE
        self.model = models.efficientnet_v2_s(weights=models.EfficientNet_V2_S_Weights.IMAGENET1K_V1)
        self.model = self.model.eval().to(self.device)
        # Remove classifier head — output is pooled features
        self.model.classifier = torch.nn.Identity()
        logger.info("EfficientNetV2-S loaded on %s (params: %dM)",
                     self.device,
                     sum(p.numel() for p in self.model.parameters()) // 1_000_000)

    @torch.no_grad()
    def extract(self, image: np.ndarray) -> np.ndarray:
        """Single image: float32 [0,1] HWC RGB -> 1280-dim vector."""
        tensor = torch.from_numpy(image).permute(2, 0, 1).unsqueeze(0).float().to(self.device)
        tensor = _transform(tensor)
        embedding = self.model(tensor).cpu().numpy().flatten()
        return embedding.astype(np.float32)

    @torch.no_grad()
    def extract_batch(self, images: List[np.ndarray]) -> np.ndarray:
        """N images: list of float32 [0,1] HWC RGB -> (N, 1280) matrix."""
        tensors = [torch.from_numpy(img).permute(2, 0, 1).float() for img in images]
        batch = torch.stack(tensors).to(self.device)
        batch = _transform(batch)
        embeddings = self.model(batch).cpu().numpy()
        return embeddings.astype(np.float32)


def get_encoder() -> ImageEncoder:
    global _encoder
    if _encoder is None:
        _encoder = ImageEncoder()
    return _encoder


def extract_embedding(image: np.ndarray) -> np.ndarray:
    """Extract a single 1280-dim embedding.

    Args:
        image: float32 numpy array of shape (H, W, 3) with values in [0, 1].

    Returns:
        1D float32 numpy array, length EMBEDDING_DIM (1280).
    """
    encoder = get_encoder()
    return encoder.extract(image)


def extract_embeddings_batch(images: List[np.ndarray]) -> np.ndarray:
    """Extract embeddings for N images in one batched forward pass.
    Returns shape (N, EMBEDDING_DIM).
    """
    encoder = get_encoder()
    return encoder.extract_batch(images)


# pHash fast pre-check (hybrid approach)

def compute_phash(image: np.ndarray) -> str:
    """Compute perceptual hash of a preprocessed image (float32 [0,1] HWC RGB).

    Returns hex string of the 64-bit hash (suitable for DB storage).
    """
    import imagehash
    img_uint8 = (image * 255).astype(np.uint8)
    pil_img = Image.fromarray(img_uint8)
    return str(imagehash.phash(pil_img))


def phash_hamming_distance(hash_a: str, hash_b: str) -> int:
    """Hamming distance between two pHash hex strings."""
    import imagehash
    return imagehash.hex_to_hash(hash_a) - imagehash.hex_to_hash(hash_b)
