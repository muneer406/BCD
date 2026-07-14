"""
BCD Backend - export_onnx.py
Issue #134: Export a lightweight vision backbone to ONNX with int8 quantization
for on-device embedding inference.

Uses torchvision MobileNetV3-Small as a practical stand-in for MobileViT-S
(torchvision does not ship MobileViT).  The classifier head is replaced with
an identity so the model outputs 576-dim pooled image embeddings.

Run:
    cd backend
    python scripts/export_onnx.py

Outputs:
    backend/models/mobilenetv3_small_embedding.onnx
    backend/models/mobilenetv3_small_embedding_int8.onnx
    backend/evaluation/data/results/onnx_benchmark.json
"""

from __future__ import annotations

import json
import logging
import os
import statistics
import time
from pathlib import Path
from typing import Any, Dict

import numpy as np
import onnxruntime as ort
import torch
import torchvision.models as models
from onnxruntime.quantization import QuantType, quantize_dynamic

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

BACKEND_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BACKEND_DIR / "models"
RESULTS_DIR = BACKEND_DIR / "evaluation" / "data" / "results"

ONNX_PATH = MODELS_DIR / "mobilenetv3_small_embedding.onnx"
QUANTIZED_PATH = MODELS_DIR / "mobilenetv3_small_embedding_int8.onnx"
BENCHMARK_PATH = RESULTS_DIR / "onnx_benchmark.json"

INPUT_SHAPE = (1, 3, 224, 224)
EMBEDDING_DIM = 576
OPSET_VERSION = 17
NUM_BENCHMARK_RUNS = 100


def _build_feature_extractor() -> torch.nn.Module:
    """Load MobileNetV3-Small and strip the classifier head."""
    weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
    model = models.mobilenet_v3_small(weights=weights)
    model.classifier = torch.nn.Identity()  # type: ignore[assignment]
    model.eval()
    return model


def export_onnx(model: torch.nn.Module, output_path: Path) -> None:
    """Export the feature extractor to ONNX with a dynamic batch axis."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    dummy_input = torch.randn(INPUT_SHAPE, requires_grad=False)

    dynamic_axes = {
        "input": {0: "batch"},
        "output": {0: "batch"},
    }

    torch.onnx.export(
        model,
        dummy_input,
        str(output_path),
        export_params=True,
        opset_version=OPSET_VERSION,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes=dynamic_axes,
    )
    logger.info("Exported ONNX model to %s", output_path)


def quantize_model(onnx_path: Path, quantized_path: Path) -> None:
    """Apply dynamic int8 quantization to an ONNX model."""
    quantized_path.parent.mkdir(parents=True, exist_ok=True)
    quantize_dynamic(
        model_input=str(onnx_path),
        model_output=str(quantized_path),
        weight_type=QuantType.QInt8,
    )
    logger.info("Exported quantized ONNX model to %s", quantized_path)


def _create_inference_session(model_path: Path) -> ort.InferenceSession:
    """Create a CPU ONNX Runtime inference session."""
    providers = ["CPUExecutionProvider"]
    session_options = ort.SessionOptions()
    session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(str(model_path), sess_options=session_options, providers=providers)


def run_inference(session: ort.InferenceSession, input_array: np.ndarray) -> np.ndarray:
    """Run a single inference and return the embedding array."""
    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: input_array.astype(np.float32)})[0]
    return np.asarray(output)


def validate_model(model_path: Path, reference_session: ort.InferenceSession | None = None) -> np.ndarray:
    """Smoke-test a model: shape, non-NaN, non-zero, deterministic with same input."""
    session = _create_inference_session(model_path)
    rng = np.random.default_rng(42)
    x = rng.random(INPUT_SHAPE).astype(np.float32)

    out = run_inference(session, x)
    assert out.shape == (1, EMBEDDING_DIM), f"Unexpected output shape {out.shape}"
    assert not np.isnan(out).any(), "Output contains NaN values"
    assert not np.all(out == 0), "Output is all zeros"

    out2 = run_inference(session, x)
    assert np.allclose(out, out2, atol=1e-6), "Model is not deterministic for identical input"

    x_other = rng.random(INPUT_SHAPE).astype(np.float32)
    out_other = run_inference(session, x_other)
    assert not np.allclose(out, out_other, atol=1e-6), "Different inputs produced identical embeddings"

    if reference_session is not None:
        ref = run_inference(reference_session, x)
        assert ref.shape == out.shape, "Quantized output shape differs from unquantized"
        # Dynamic int8 can introduce small numerical drift; verify it is bounded.
        diff = float(np.max(np.abs(ref - out)))
        logger.info("Max absolute drift vs unquantized for %s: %.6f", model_path.name, diff)
        assert diff < 5.0, f"Quantized drift too large: {diff}"

    logger.info("Validation passed for %s (shape=%s, values valid)", model_path.name, out.shape)
    return out


def benchmark_model(model_path: Path) -> Dict[str, Any]:
    """Run N inferences on CPU and report latency statistics."""
    session = _create_inference_session(model_path)
    rng = np.random.default_rng(1337)
    # Warm-up
    for _ in range(5):
        run_inference(session, rng.random(INPUT_SHAPE).astype(np.float32))

    latencies_ms: list[float] = []
    out: np.ndarray | None = None
    for _ in range(NUM_BENCHMARK_RUNS):
        x = rng.random(INPUT_SHAPE).astype(np.float32)
        start = time.perf_counter()
        out = run_inference(session, x)
        end = time.perf_counter()
        latencies_ms.append((end - start) * 1000.0)

    if out is None:
        raise RuntimeError("Benchmark loop did not produce any output")

    latencies_ms.sort()
    n = len(latencies_ms)
    p95_index = int(np.ceil(0.95 * n)) - 1

    embedding = out
    file_size_mb = os.path.getsize(model_path) / (1024 * 1024)

    return {
        "model_path": str(model_path.relative_to(BACKEND_DIR)),
        "embedding_dim": int(embedding.shape[1]),
        "file_size_mb": round(file_size_mb, 4),
        "num_runs": n,
        "latency_ms": {
            "min": round(min(latencies_ms), 4),
            "max": round(max(latencies_ms), 4),
            "mean": round(statistics.mean(latencies_ms), 4),
            "median": round(statistics.median(latencies_ms), 4),
            "p95": round(latencies_ms[p95_index], 4),
        },
    }


def main() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Loading MobileNetV3-Small feature extractor...")
    model = _build_feature_extractor()
    total_params = sum(p.numel() for p in model.parameters())
    logger.info("Model loaded (params: %d, ~%.2fM)", total_params, total_params / 1e6)

    export_onnx(model, ONNX_PATH)
    quantize_model(ONNX_PATH, QUANTIZED_PATH)

    logger.info("Validating unquantized model...")
    unquantized_session = _create_inference_session(ONNX_PATH)
    validate_model(ONNX_PATH)

    logger.info("Validating quantized model...")
    validate_model(QUANTIZED_PATH, reference_session=unquantized_session)

    logger.info("Benchmarking unquantized model...")
    unquantized_bench = benchmark_model(ONNX_PATH)
    logger.info("Benchmarking quantized model...")
    quantized_bench = benchmark_model(QUANTIZED_PATH)

    results: Dict[str, Any] = {
        "model": "mobilenet_v3_small",
        "task": "embedding_extraction",
        "input_shape": list(INPUT_SHAPE),
        "embedding_dim": EMBEDDING_DIM,
        "opset_version": OPSET_VERSION,
        "total_parameters": total_params,
        "unquantized": unquantized_bench,
        "quantized": quantized_bench,
    }

    BENCHMARK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with BENCHMARK_PATH.open("w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    logger.info("Benchmark results written to %s", BENCHMARK_PATH)

    print("\n=== ONNX Export Summary ===")
    print(f"Unquantized: {ONNX_PATH} ({unquantized_bench['file_size_mb']} MB)")
    print(f"Quantized:   {QUANTIZED_PATH} ({quantized_bench['file_size_mb']} MB)")
    print(f"Embedding dim: {EMBEDDING_DIM}")
    print("Quantized latency (ms):")
    for k, v in quantized_bench["latency_ms"].items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
