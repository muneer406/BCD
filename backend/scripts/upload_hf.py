import os, urllib.request, json
from huggingface_hub import HfApi

api = HfApi(token=os.environ["HF_TOKEN"])
space = "Muneer320/bcd-backend"

# Files to always skip
SKIP_PREFIXES = ("__pycache__", ".pyc", ".gitignore", "README.md")
SKIP_FILES = {"models/mobilenetv3_small_embedding_int8.onnx"}

uploads = []

# Walk backend/ and collect non-binary files
for root, dirs, files in os.walk("backend"):
    for f in files:
        local = os.path.join(root, f)
        remote = os.path.relpath(local, "backend")
        if any(remote.startswith(p) for p in SKIP_PREFIXES):
            continue
        if remote in SKIP_FILES:
            continue
        # Skip non-essential files
        if f.endswith((".pyc", ".onnx")):
            continue
        uploads.append((local, remote))

# Download model from GitHub Releases and upload separately
model_url = "https://github.com/muneer406/BCD/releases/download/v0.1.0-models/mobilenetv3_small_embedding_int8.onnx"
model_local = "/tmp/model.onnx"

if not os.path.exists(model_local):
    print("Downloading model from GitHub Releases...")
    urllib.request.urlretrieve(model_url, model_local)
    print(f"  {os.path.getsize(model_local):,} bytes")

# Upload in batches to avoid too many commits
batch = []
for local, remote in uploads:
    print(f"  {remote}")
    batch.append({"local": local, "remote": remote})
    if len(batch) >= 50:
        api.upload_file(path_or_fileobj=batch[0]["local"], path_in_repo=batch[0]["remote"], repo_id=space, repo_type="space")
        batch = []

if batch:
    api.upload_file(path_or_fileobj=batch[0]["local"], path_in_repo=batch[0]["remote"], repo_id=space, repo_type="space")

print("Upload complete")
