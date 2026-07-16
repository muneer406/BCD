import os, urllib.request
from huggingface_hub import HfApi, CommitOperationAdd

api = HfApi(token=os.environ["HF_TOKEN"])
space = "Muneer320/bcd-backend"

operations = []

# Upload app/ files
for root, dirs, files in os.walk("backend"):
    for f in files:
        local = os.path.join(root, f)
        remote = os.path.relpath(local, "backend")
        if remote.endswith((".pyc",)):
            continue
        if remote.startswith("__pycache__"):
            continue
        if remote in ("Dockerfile", "scripts/upload_hf.py", "README.md"):
            continue
        print(f"  {remote}")
        with open(local, "rb") as fh:
            operations.append(CommitOperationAdd(path_in_repo=remote, path_or_fileobj=fh.read()))

# Restore the multi-stage Dockerfile with fixed torch version
dockerfile = r"""# Stage 1: Build
FROM python:3.11-slim AS builder

WORKDIR /install

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    torch==2.1.2 \
    torchvision==0.16.2 \
    --extra-index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN grep -vE "^torch==|^torchvision==" requirements.txt > requirements_no_torch.txt && \
    pip install --no-cache-dir -r requirements_no_torch.txt

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY app/ ./app/

ENV API_PORT=7860
ENV API_HOST=0.0.0.0

EXPOSE 7860

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}
"""
print(f"  Dockerfile (restored)")
operations.append(CommitOperationAdd(path_in_repo="Dockerfile", path_or_fileobj=dockerfile.encode()))

# Proper README
readme = """---
title: BCD Backend
emoji: 🩺
colorFrom: indigo
colorTo: blue
sdk: docker
sdk_version: "1.0"
python_version: "3.11"
app_file: app/main.py
pinned: false
---

"""
print(f"  README.md")
operations.append(CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=readme.encode()))

print(f"Committing {len(operations)} files...")
api.create_commit(
    repo_id=space,
    repo_type="space",
    operations=operations,
    commit_message=f"deploy: GitHub {os.environ.get('SHORT_SHA', 'manual')}",
)
print("Upload complete")
