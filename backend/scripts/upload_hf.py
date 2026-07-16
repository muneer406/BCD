import os, urllib.request
from huggingface_hub import HfApi

api = HfApi(token=os.environ["HF_TOKEN"])
space = "Muneer320/bcd-backend"

# Upload backend/ files
for root, dirs, files in os.walk("backend"):
    for f in files:
        local = os.path.join(root, f)
        remote = os.path.relpath(local, "backend")
        print(f"  {remote}")
        api.upload_file(
            path_or_fileobj=local,
            path_in_repo=remote,
            repo_id=space,
            repo_type="space",
        )

# Download model from GitHub Releases and upload
model_url = "https://github.com/muneer406/BCD/releases/download/v0.1.0-models/mobilenetv3_small_embedding_int8.onnx"
model_local = "/tmp/model.onnx"
model_remote = "models/mobilenetv3_small_embedding_int8.onnx"

if not os.path.exists(model_local):
    print(f"  Downloading model...")
    urllib.request.urlretrieve(model_url, model_local)
    size = os.path.getsize(model_local)
    print(f"  Downloaded {size:,} bytes")

print(f"  Uploading {model_remote}...")
api.upload_file(
    path_or_fileobj=model_local,
    path_in_repo=model_remote,
    repo_id=space,
    repo_type="space",
)

print("Upload complete")
