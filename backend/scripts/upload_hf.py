import os, urllib.request
from huggingface_hub import HfApi, CommitOperationAdd, CommitOperationDelete

api = HfApi(token=os.environ["HF_TOKEN"])
space = "Muneer320/bcd-backend"

operations = []

# Upload app/ files
for root, dirs, files in os.walk("backend"):
    for f in files:
        local = os.path.join(root, f)
        remote = os.path.relpath(local, "backend")
        if remote.endswith((".pyc", ".onnx")):
            continue
        if remote.startswith("__pycache__"):
            continue
        if remote in ("Dockerfile",):
            continue  # Don't use Docker - use Python SDK
        print(f"  {remote}")
        with open(local, "rb") as fh:
            operations.append(CommitOperationAdd(path_in_repo=remote, path_or_fileobj=fh.read()))

# Delete Dockerfile so HF Space uses Python SDK
print(f"  Dockerfile (deleted)")
operations.append(CommitOperationDelete(path_in_repo="Dockerfile"))

# Proper README with Python SDK
readme = """---
title: BCD Backend
emoji: 🩺
colorFrom: indigo
colorTo: blue
sdk: python
sdk_version: "3.11"
python_version: "3.11"
app_file: app/main.py
pinned: false
---

"""
print(f"  README.md (Python SDK)")
operations.append(CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=readme.encode()))

# Marker
operations.append(CommitOperationAdd(path_in_repo=".hf-sync-marker", path_or_fileobj=f"sync: {os.environ.get('GITHUB_SHA','manual')}".encode()))

print(f"\nCommitting {len(operations)} files...")
api.create_commit(
    repo_id=space,
    repo_type="space",
    operations=operations,
    commit_message=f"deploy: GitHub {os.environ.get('SHORT_SHA', 'manual')}",
)
print("Upload complete")
