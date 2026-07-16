import os, urllib.request, datetime
from huggingface_hub import HfApi
from huggingface_hub import CommitOperationAdd, CommitOperationDelete

api = HfApi(token=os.environ["HF_TOKEN"])
space = "Muneer320/bcd-backend"

operations = []

# Walk backend/ and collect files to upload
for root, dirs, files in os.walk("backend"):
    for f in files:
        local = os.path.join(root, f)
        remote = os.path.relpath(local, "backend")
        if remote.endswith((".pyc", ".onnx")):
            continue
        if remote in ("Dockerfile", "README.md"):
            continue
        if remote.startswith("__pycache__"):
            continue
        print(f"  {remote}")
        with open(local, "rb") as fh:
            operations.append(CommitOperationAdd(path_in_repo=remote, path_or_fileobj=fh.read()))

# Restore the working Dockerfile
dockerfile_content = b"""# -- Stage 1: Build
FROM python:3.11-slim AS builder
WORKDIR /install
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir torch==2.1.0+cpu torchvision==0.16.0+cpu --extra-index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN grep -vE "^torch==|^torchvision==" requirements.txt > requirements_no_torch.txt && \
    pip install --no-cache-dir -r requirements_no_torch.txt
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 && rm -rf /var/lib/apt/lists/*
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
operations.append(CommitOperationAdd(path_in_repo="Dockerfile", path_or_fileobj=dockerfile_content))

# Proper README with YAML frontmatter
readme_str = """---
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
print(f"  README.md (fixed)")
operations.append(CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=readme_str.encode()))

# Marker file to guarantee a change
marker = f"sync: {datetime.datetime.utcnow().isoformat()}".encode()
operations.append(CommitOperationAdd(path_in_repo=".hf-sync-marker", path_or_fileobj=marker))

# Single commit with all operations
print(f"\nCommitting {len(operations)} file(s)...")
api.create_commit(
    repo_id=space,
    repo_type="space",
    operations=operations,
    commit_message=f"deploy: GitHub {os.environ.get('SHORT_SHA', 'manual')}",
)

print("Upload complete")
