FROM python:3.11-slim

WORKDIR /app

# Install build tools and runtime libs needed by some packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
RUN pip install --no-cache-dir uv

# Install CPU-only PyTorch first (saves ~1.5 GB vs the default CUDA build)
RUN uv pip install --system --no-cache \
    torch==2.1.0+cpu \
    torchvision==0.16.0+cpu \
    --extra-index-url https://download.pytorch.org/whl/cpu

# Remaining dependencies (torch already satisfied, won't be reinstalled)
COPY requirements.txt .
RUN grep -vE "^torch==|^torchvision==" requirements.txt > requirements_no_torch.txt && \
    uv pip install --system --no-cache -r requirements_no_torch.txt

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
# HF Space build cache refresh marker — safe to remove after next successful deploy
