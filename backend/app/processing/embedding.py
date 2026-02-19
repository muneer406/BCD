"""
BCD Backend - embedding.py
Phase 6: Feature extraction using EfficientNetV2-S (1280-dim output).

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

import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms as transforms

logger = logging.getLogger(__name__)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

EMBEDDING_DIM = 1280   # EfficientNetV2-S feature dimension

_encoder = None


class ImageEncoder:
    """
    Wraps EfficientNetV2-S with the classifier head replaced by Identity()
    so the model outputs its 1280-dim penultimate feature vector.
    Uses ImageNet pre-trained weights.
    """

    def __init__(self):
        model = models.efficientnet_v2_s(
            weights=models.EfficientNet_V2_S_Weights.DEFAULT)

        # Remove the classifier head — keep only the feature extractor.
        # output shape: (batch, 1280)
        model.classifier = torch.nn.Identity()

        model.eval()
        model.to(DEVICE)
        self.model = model
        logger.info(
            "EfficientNetV2-S loaded (ImageNet weights, device=%s)", DEVICE)

        # Standard ImageNet normalisation — same as before.
        self.transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])

    def extract(self, image: np.ndarray) -> np.ndarray:
        """
        Extract the 1280-dim embedding from a float32 [0,1] 224×224 RGB numpy
        array.  Returns a 1D float32 numpy array of length EMBEDDING_DIM.
        """
        # Convert float32 [0,1] → uint8 for transforms.ToTensor() compatibility,
        # or pass directly — transforms.ToTensor handles both cases.
        if image.dtype == np.float32:
            # ToTensor expects HWC uint8 or HWC float [0,1]; float [0,1] is fine.
            pass

        tensor = self.transform(image).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            embedding = self.model(tensor)

        return embedding.squeeze().cpu().numpy().astype(np.float32)


def get_encoder() -> ImageEncoder:
    """Return the singleton ImageEncoder, creating it on first call."""
    global _encoder
    if _encoder is None:
        _encoder = ImageEncoder()
    return _encoder


def extract_embedding(image: np.ndarray, user_mean: np.ndarray | None = None) -> np.ndarray:
    """
    Extract a 1280-dim embedding and optionally centre it by the user mean.

    Args:
        image:     float32 [0,1] 224×224 RGB numpy array (from preprocess_pipeline).
        user_mean: optional per-user mean embedding (same shape) to subtract
                   for within-user normalisation (computed by comparison_service).

    Returns:
        1D float32 numpy array, length EMBEDDING_DIM (1280).
    """
    encoder = get_encoder()
    embedding = encoder.extract(image)

    if user_mean is not None:
        embedding = embedding - user_mean

    return embedding
