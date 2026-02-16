"""
BCD Backend - embedding.py
Production-ready embedding extraction using ResNet50.
"""

import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms as transforms

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_encoder = None


class ImageEncoder:

    def __init__(self):

        model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)

        model = torch.nn.Sequential(
            *(list(model.children())[:-1])
        )

        model.eval()
        model.to(DEVICE)

        self.model = model

        self.transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])

    def extract(self, image: np.ndarray) -> np.ndarray:

        tensor = self.transform(image).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            embedding = self.model(tensor)

        embedding = embedding.squeeze().cpu().numpy()

        return embedding


def get_encoder():

    global _encoder

    if _encoder is None:
        _encoder = ImageEncoder()

    return _encoder


def extract_embedding(image: np.ndarray, user_mean: np.ndarray | None = None) -> np.ndarray:
    """
    Extract embedding and normalize per user.
    """

    encoder = get_encoder()

    embedding = encoder.extract(image)

    if user_mean is not None:
        embedding = embedding - user_mean

    return embedding
