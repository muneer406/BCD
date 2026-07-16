"""Download ONNX model from GitHub Releases at startup."""
import os, sys, urllib.request

MODEL_URL = "https://github.com/muneer406/BCD/releases/download/v0.1.0-models/mobilenetv3_small_embedding_int8.onnx"
LOCAL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
LOCAL_PATH = os.path.join(LOCAL_DIR, "mobilenetv3_small_embedding_int8.onnx")

def ensure_model():
    if os.path.exists(LOCAL_PATH) and os.path.getsize(LOCAL_PATH) > 1000000:
        print(f"Model exists at {LOCAL_PATH}")
        return True
    os.makedirs(LOCAL_DIR, exist_ok=True)
    print(f"Downloading model from GitHub Releases...")
    try:
        urllib.request.urlretrieve(MODEL_URL, LOCAL_PATH)
        size = os.path.getsize(LOCAL_PATH)
        print(f"Downloaded {size:,} bytes to {LOCAL_PATH}")
        return True
    except Exception as e:
        print(f"Failed to download model: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    sys.exit(0 if ensure_model() else 1)
