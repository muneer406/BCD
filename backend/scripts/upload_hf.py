import os, urllib.request
from huggingface_hub import HfApi

api = HfApi(token=os.environ["HF_TOKEN"])
space = "Muneer320/bcd-backend"

# Ensure README has proper HF Space frontmatter
readme_content = """---
title: BCD Backend
emoji: stethoscope
colorFrom: indigo
colorTo: blue
sdk: docker
sdk_version: "1.0"
python_version: "3.11"
app_file: app/main.py
pinned: false
---

"""
try:
    existing = api.read_file(repo_id=space, path_in_repo="README.md", repo_type="space")
    if "sdk: docker" not in existing:
        print("  FIXING README.md")
        api.upload_file(path_or_fileobj=readme_content.encode(), path_in_repo="README.md", repo_id=space, repo_type="space")
except Exception:
    print("  CREATING README.md")
    api.upload_file(path_or_fileobj=readme_content.encode(), path_in_repo="README.md", repo_id=space, repo_type="space")

# Upload files one by one
for root, dirs, files in os.walk("backend"):
    for f in files:
        local = os.path.join(root, f)
        remote = os.path.relpath(local, "backend")
        if remote.endswith((".pyc", ".onnx")):
            continue
        if remote.startswith("__pycache__"):
            continue
        if remote == "README.md":
            continue
        print(f"  {remote}")
        api.upload_file(
            path_or_fileobj=local,
            path_in_repo=remote,
            repo_id=space,
            repo_type="space",
        )

print("Upload complete")
