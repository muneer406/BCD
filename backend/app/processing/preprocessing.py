"""
BCD Backend - preprocessing.py
Phase 6: Corrected preprocessing pipeline.

Pipeline order (per Phase 6 spec):
  1. Load + EXIF transpose            — load_image_from_storage()
  2. Denoise                          — denoise_image()
  3. CLAHE normalisation              — apply_clahe()
  4. Torso-region detection + crop    — detect_torso_crop()
  5. Resize to 384×384                — resize_intermediate()
  6. Centre crop to 224×224           — center_crop_final()
  7. Sharpen                          — sharpen_image()
  8. Quality scoring                  — compute_image_quality()

Changes from Phase 5:
  - Removed: auto_orient_image / _silhouette_widths / _neck_at_top_score
    → orientation is handled exclusively by EXIF (ImageOps.exif_transpose).
      The capture flow guarantees correct orientation; anatomical detection
      added noise rather than fixing anything.
  - Replaced: cv2.equalizeHist (global, destroys local contrast)
    → CLAHE (contrast-limited adaptive, preserves structural detail)
  - Replaced: blind centre crop
    → contour-based torso-region detection with centre-crop fallback
  - Added: fastNlMeansDenoisingColored (removes sensor noise)
  - Added: unsharp-mask sharpening after resize
  - Added: two-step resize (384 intermediate → 224 final centre crop)
"""

import io
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageOps
from supabase import Client

from .quality import ImageQuality, compute_image_quality

# Pipeline constants
INTERMEDIATE_SIZE = 384   # resize target before final crop
TARGET_SIZE = 224   # final model input size


@dataclass
class PreprocessResult:
    """Holds a fully preprocessed image together with its quality metrics."""
    image: np.ndarray    # float32 [0, 1], TARGET_SIZE × TARGET_SIZE, RGB
    quality: ImageQuality


# ---------------------------------------------------------------------------
# Step 1 — Load
# ---------------------------------------------------------------------------

def load_image_from_storage(storage_path: str, supabase: Client) -> np.ndarray:
    """
    Download from Supabase Storage, honour EXIF orientation, return uint8 RGB.

    EXIF transpose is the ONLY orientation correction performed.
    The app's guided capture flow ensures the user holds the phone correctly;
    EXIF handles the remaining tag-based cases automatically.
    """
    response = supabase.storage.from_("bcd-images").download(storage_path)
    image = Image.open(io.BytesIO(response))
    image = ImageOps.exif_transpose(image)   # honour EXIF rotation/flip tag
    if image.mode != "RGB":
        image = image.convert("RGB")
    return np.array(image)   # uint8 [0, 255]


# ---------------------------------------------------------------------------
# Step 2 — Denoise
# ---------------------------------------------------------------------------

def denoise_image(image: np.ndarray) -> np.ndarray:
    """
    Remove sensor noise using Non-Local Means denoising (colour-aware).

    Parameters chosen for a good noise/detail balance on phone photos:
      h=6          — filter strength for luminance (lower = less smoothing)
      hColor=6     — filter strength for colour channels
      templateWindowSize=7
      searchWindowSize=21
    """
    if image.dtype != np.uint8:
        image = (np.clip(image, 0.0, 1.0) * 255).astype(np.uint8)
    denoised = cv2.fastNlMeansDenoisingColored(
        image,
        None,
        h=6,
        hColor=6,
        templateWindowSize=7,
        searchWindowSize=21,
    )
    return denoised   # uint8


# ---------------------------------------------------------------------------
# Step 3 — CLAHE normalisation
# ---------------------------------------------------------------------------

def apply_clahe(image: np.ndarray) -> np.ndarray:
    """
    Contrast-Limited Adaptive Histogram Equalisation on the L channel (LAB).

    Improves local contrast while preventing over-amplification of noise —
    far better than global histogram equalisation for images with shadows.
    Returns float32 [0, 1] RGB.
    """
    if image.dtype != np.uint8:
        image = (np.clip(image, 0.0, 1.0) * 255).astype(np.uint8)

    lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)

    return enhanced.astype(np.float32) / 255.0   # float32 [0, 1]


# ---------------------------------------------------------------------------
# Step 4 — Torso-region crop
# ---------------------------------------------------------------------------

def detect_torso_crop(image: np.ndarray, padding: float = 0.05) -> np.ndarray:
    """
    Detect the primary subject (torso) via contour analysis and crop to it.

    Algorithm:
      1. Convert to greyscale
      2. Adaptive threshold (handles variable lighting)
      3. Find contours; filter to minimum area (5% of image)
      4. Among contours whose bounding box centre is within the middle 60%
         of the image width, pick the largest by area
      5. Crop to that bounding box + padding
      6. Fallback: if no suitable contour found, return the image unchanged
         (the centre-crop in step 6 will still produce the correct 224×224)

    Works on both float32 [0,1] and uint8 images.
    Returns the same dtype as input.
    """
    original_dtype = image.dtype

    if image.dtype != np.uint8:
        src = (np.clip(image, 0.0, 1.0) * 255).astype(np.uint8)
    else:
        src = image.copy()

    h, w = src.shape[:2]
    gray = cv2.cvtColor(src, cv2.COLOR_RGB2GRAY)

    # Adaptive threshold handles uneven background
    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=51,
        C=10,
    )

    # Clean up small noise
    kernel = np.ones((5, 5), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(
        thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image  # fallback

    min_area = h * w * 0.05   # contour must cover ≥5% of image
    centre_band_x0 = w * 0.20
    centre_band_x1 = w * 0.80

    best = None
    best_area = 0.0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        bx, by, bw, bh = cv2.boundingRect(cnt)
        cx = bx + bw / 2.0
        if not (centre_band_x0 <= cx <= centre_band_x1):
            continue
        if area > best_area:
            best_area = area
            best = (bx, by, bw, bh)

    if best is None:
        return image  # fallback — no suitable torso contour found

    bx, by, bw, bh = best
    pad_x = int(bw * padding)
    pad_y = int(bh * padding)
    x1 = max(0, bx - pad_x)
    y1 = max(0, by - pad_y)
    x2 = min(w, bx + bw + pad_x)
    y2 = min(h, by + bh + pad_y)

    cropped = image[y1:y2, x1:x2]

    # Ensure result is at least 64×64 (degenerate crop guard)
    ch, cw = cropped.shape[:2]
    if ch < 64 or cw < 64:
        return image  # fallback

    return cropped


# ---------------------------------------------------------------------------
# Step 5 — Resize to intermediate resolution
# ---------------------------------------------------------------------------

def resize_intermediate(image: np.ndarray, size: int = INTERMEDIATE_SIZE) -> np.ndarray:
    """Resize to size×size preserving detail (INTER_LANCZOS4 for downscale)."""
    if image.dtype != np.uint8:
        src = (np.clip(image, 0.0, 1.0) * 255).astype(np.uint8)
        resized = cv2.resize(
            src, (size, size), interpolation=cv2.INTER_LANCZOS4)
        return resized.astype(np.float32) / 255.0
    return cv2.resize(image, (size, size), interpolation=cv2.INTER_LANCZOS4)


# ---------------------------------------------------------------------------
# Step 6 — Centre crop to final size
# ---------------------------------------------------------------------------

def center_crop_final(image: np.ndarray, size: int = TARGET_SIZE) -> np.ndarray:
    """Centre-crop to exactly size×size."""
    h, w = image.shape[:2]
    y0 = (h - size) // 2
    x0 = (w - size) // 2
    return image[y0: y0 + size, x0: x0 + size]


# ---------------------------------------------------------------------------
# Step 7 — Sharpen
# ---------------------------------------------------------------------------

def sharpen_image(image: np.ndarray) -> np.ndarray:
    """
    Unsharp-mask sharpening to recover detail lost in resizing.

    amount=0.8 is mild — enough to restore edge definition without artefacts.
    Works on float32 [0,1] or uint8.
    """
    if image.dtype != np.uint8:
        src = (np.clip(image, 0.0, 1.0) * 255).astype(np.uint8)
        blurred = cv2.GaussianBlur(src, (0, 0), sigmaX=1.5)
        sharpened = cv2.addWeighted(src, 1.8, blurred, -0.8, 0)
        return sharpened.astype(np.float32) / 255.0
    blurred = cv2.GaussianBlur(image, (0, 0), sigmaX=1.5)
    return cv2.addWeighted(image, 1.8, blurred, -0.8, 0)


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

def preprocess_pipeline(storage_path: str, supabase: Client) -> PreprocessResult:
    """
    Full Phase 6 preprocessing pipeline.

    Steps:
      load → EXIF → denoise → CLAHE → torso crop → resize 384
      → centre crop 224 → sharpen → quality score

    Returns PreprocessResult with float32 [0,1] 224×224 RGB image
    and quality metrics computed on the final (model-input) image.
    """
    image = load_image_from_storage(storage_path, supabase)  # uint8
    image = denoise_image(image)                              # uint8
    image = apply_clahe(image)                                # float32
    # float32 (or fallback)
    image = detect_torso_crop(image)
    # float32, 384×384
    image = resize_intermediate(image)
    # float32, 224×224
    image = center_crop_final(image)
    image = sharpen_image(image)                              # float32

    quality = compute_image_quality(image)

    return PreprocessResult(image=image, quality=quality)
