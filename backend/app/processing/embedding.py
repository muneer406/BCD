import hashlib
import random
from typing import Any, List


def extract_embedding(image: Any, dim: int = 128) -> List[float]:
    # Deterministic placeholder embedding based on image hash
    data = str(image).encode("utf-8")
    seed = int(hashlib.sha256(data).hexdigest(), 16) % (2**32)
    rng = random.Random(seed)
    return [rng.random() for _ in range(dim)]
