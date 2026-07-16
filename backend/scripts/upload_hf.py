import os, urllib.request
from huggingface_hub import HfApi

api = HfApi(token=os.environ["HF_TOKEN"])
space = "Muneer320/bcd-backend"

# Upload files, but skip Dockerfile (let existing one stay)
for root, dirs, files in os.walk("backend"):
    for f in files:
        local = os.path.join(root, f)
        remote = os.path.relpath(local, "backend")
        # Skip files that should not be uploaded
        if remote.endswith((".pyc", ".onnx")):
            continue
        if remote in ("Dockerfile",):
            print(f"  SKIP {remote}")
            continue
        if remote.startswith("__pycache__"):
            continue
        print(f"  {remote}")
        api.upload_file(
            path_or_fileobj=local,
            path_in_repo=remote,
            repo_id=space,
            repo_type="space",
        )

# Restore the working Dockerfile with model download added
dockerfile_content = """# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /install

# Install build tools (needed by some packages)
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    && rm -rf /var/lib/apt/lists/*

# ── CPU-only PyTorch first (saves ~1.5 GB vs the default CUDA build) ─────────
RUN pip install --no-cache-dir \\
    torch==2.1.0+cpu \\
    torchvision==0.16.0+cpu \\
    --extra-index-url https://download.pytorch.org/whl/cpu

# ── Remaining dependencies (torch already satisfied, won't be reinstalled) ───
COPY requirements.txt .
RUN grep -vE "^torch==|^torchvision==" requirements.txt > requirements_no_torch.txt && \\
    pip install --no-cache-dir -r requirements_no_torch.txt

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Runtime libs needed by opencv-python-headless
RUN apt-get update && apt-get install -y --no-install-recommends \\
    libglib2.0-0 \\
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application source
COPY app/ ./app/

# ── Hugging Face Spaces runs on port 7860 ─────────────────────────────────────
# Override API_PORT if deploying elsewhere (e.g. docker-compose maps 8000→7860)
ENV API_PORT=7860
ENV API_HOST=0.0.0.0

EXPOSE 7860

# Non-root user (HF Spaces best practice)
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}
"""

print(f"  Dockerfile (restored)")
api.upload_file(
    path_or_fileobj=dockerfile_content.encode(),
    path_in_repo="Dockerfile",
    repo_id=space,
    repo_type="space",
)

print("Upload complete")
