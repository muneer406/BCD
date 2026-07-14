"""
BCD Backend - test_onnx.py
Simple smoke-test for the exported ONNX embedding model.

Run:
    cd backend
    python scripts/test_onnx.py [path/to/model.onnx]

If no path is provided, defaults to:
    backend/models/mobilenetv3_small_embedding.onnx
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = BACKEND_DIR / "models" / "mobilenetv3_small_embedding.onnx"
INPUT_SHAPE = (1, 3, 224, 224)


def main() -> None:
    model_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_MODEL_PATH
    if not model_path.exists():
        raise FileNotFoundError(f"ONNX model not found: {model_path}")

    print(f"Loading ONNX model from {model_path}")
    session = ort.InferenceSession(
        str(model_path),
        providers=["CPUExecutionProvider"],
    )

    # Synthetic image: deterministic random values in [0, 1]
    rng = np.random.default_rng(42)
    synthetic_image = rng.random(INPUT_SHAPE).astype(np.float32)

    input_name = session.get_inputs()[0].name

    # Warm-up
    session.run(None, {input_name: synthetic_image})

    start = time.perf_counter()
    embedding = session.run(None, {input_name: synthetic_image})[0]
    elapsed_ms = (time.perf_counter() - start) * 1000.0

    print(f"Embedding shape: {embedding.shape}")
    print(f"First 10 values: {embedding.flatten()[:10]}")
    print(f"Inference time: {elapsed_ms:.4f} ms")

    # Sanity checks
    assert embedding.shape[0] == 1, "Expected batch size 1"
    assert embedding.ndim == 2, "Expected 2D output (batch, embedding_dim)"
    assert not np.isnan(embedding).any(), "Output contains NaN"
    assert not np.all(embedding == 0), "Output is all zeros"
    print("Sanity checks passed.")


if __name__ == "__main__":
    main()
