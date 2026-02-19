"""
Preprocessing preview tool (dev-only — Phase 6).

Usage:
    python tools/preview_preprocessing.py <path_to_image>

Runs the full Phase 6 preprocessing pipeline on a LOCAL file (bypasses
Supabase storage), then saves:
  <name>_original.jpg    — untouched original
  <name>_denoised.jpg    — after denoise
  <name>_clahe.jpg       — after CLAHE normalisation
  <name>_torso_crop.jpg  — after torso-contour crop
  <name>_processed.jpg   — final 224×224 output (sharpen included)
  <name>_compare.jpg     — original vs final, side-by-side

Also prints quality metrics for the final pipeline output.

Phase 6 changes vs Phase 5 preview:
  - Removed: silhouette/neck-at-top visualisation (auto_orient_image removed)
  - Orientation is EXIF-only; EXIF is applied on load()
  - Added: intermediate step outputs (denoised, CLAHE, torso crop)
  - Added: torso-bounding-box overlay on the torso-crop image
"""

from app.processing.preprocessing import (
    apply_clahe,
    center_crop_final,
    denoise_image,
    detect_torso_crop,
    resize_intermediate,
    sharpen_image,
)
from app.processing.quality import compute_image_quality, variation_level
from PIL import Image, ImageOps
import numpy as np
import cv2
from pathlib import Path
import os
import sys
# sys.path must be set before any 'app.*' imports
os.sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_local(path: str) -> np.ndarray:
    """Load a local image as uint8 RGB, honoring EXIF orientation."""
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)   # EXIF-only orientation
    img = img.convert("RGB")
    return np.array(img)   # uint8 [0, 255]


def to_uint8(img: np.ndarray) -> np.ndarray:
    """Convert float32 [0,1] → uint8 [0,255] safely."""
    if img.dtype != np.uint8:
        return (np.clip(img, 0.0, 1.0) * 255).astype(np.uint8)
    return img


def to_bgr(img: np.ndarray) -> np.ndarray:
    """Convert uint8/float32 RGB to uint8 BGR for cv2.imwrite."""
    return cv2.cvtColor(to_uint8(img), cv2.COLOR_RGB2BGR)


def save_side_by_side(original: np.ndarray, processed: np.ndarray, out_path: str):
    """
    Side-by-side comparison: original resized to 224×224 | processed 224×224.
    """
    orig_224 = cv2.resize(to_uint8(original), (224, 224),
                          interpolation=cv2.INTER_AREA)
    orig_bgr = cv2.cvtColor(orig_224, cv2.COLOR_RGB2BGR)
    proc_bgr = cv2.cvtColor(to_uint8(processed), cv2.COLOR_RGB2BGR)

    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(orig_bgr, "Original",   (4, 18), font,
                0.5, (255, 255, 0), 1, cv2.LINE_AA)
    cv2.putText(proc_bgr, "Processed",  (4, 18), font,
                0.5, (255, 255, 0), 1, cv2.LINE_AA)

    sep = np.full((224, 4, 3), 200, dtype=np.uint8)
    combined = np.hstack([orig_bgr, sep, proc_bgr])
    cv2.imwrite(out_path, combined)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/preview_preprocessing.py <image_path>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f"File not found: {input_path}")
        sys.exit(1)

    stem = input_path.stem
    out_dir = input_path.parent

    print(f"\n── Phase 6 Preprocessing preview: {input_path.name} ──")

    # ── Step 1: Load + EXIF ────────────────────────────────────────────────
    original = load_local(str(input_path))
    print(
        f"  1. Load   : {original.shape[1]}×{original.shape[0]} px  dtype={original.dtype}")

    # ── Step 2: Denoise ────────────────────────────────────────────────────
    denoised = denoise_image(original)
    print(f"  2. Denoise: dtype={denoised.dtype}")

    # ── Step 3: CLAHE ──────────────────────────────────────────────────────
    clahe_img = apply_clahe(denoised)
    print(
        f"  3. CLAHE  : dtype={clahe_img.dtype}  range=[{clahe_img.min():.3f}, {clahe_img.max():.3f}]")

    # ── Step 4: Torso crop ─────────────────────────────────────────────────
    cropped = detect_torso_crop(clahe_img)
    if cropped.shape != clahe_img.shape:
        print(
            f"  4. Torso  : cropped to {cropped.shape[1]}×{cropped.shape[0]} px")
    else:
        print(f"  4. Torso  : no suitable contour — using full image (fallback)")

    # ── Step 5: Resize to 384 ──────────────────────────────────────────────
    resized = resize_intermediate(cropped)
    print(f"  5. Resize : {resized.shape[1]}×{resized.shape[0]} px")

    # ── Step 6: Centre crop to 224 ─────────────────────────────────────────
    centre = center_crop_final(resized)
    print(f"  6. Crop   : {centre.shape[1]}×{centre.shape[0]} px")

    # ── Step 7: Sharpen ────────────────────────────────────────────────────
    final = sharpen_image(centre)
    print(f"  7. Sharpen: dtype={final.dtype}")

    # ── Step 8: Quality metrics ────────────────────────────────────────────
    q = compute_image_quality(final)
    print(f"\n── Quality metrics (on final 224×224 image) ──")
    print(
        f"  blur_score     : {q.blur_score:.2f}  {'⚠ BLURRY' if q.is_blurry else '✓ Sharp'}")
    print(f"  brightness     : {q.brightness:.3f}  "
          f"{'⚠ TOO DARK' if q.is_too_dark else ('⚠ TOO BRIGHT' if q.is_too_bright else '✓ OK')}")
    print(f"  quality_score  : {q.quality_score:.3f} / 1.0")
    print(f"  variation_level: {variation_level(1.0 - q.quality_score)}")

    # ── Save outputs ───────────────────────────────────────────────────────
    paths = {
        "original":        (original,   f"{stem}_original.jpg"),
        "denoised":        (denoised,   f"{stem}_denoised.jpg"),
        "clahe":           (clahe_img,  f"{stem}_clahe.jpg"),
        "torso_crop":      (cropped,    f"{stem}_torso_crop.jpg"),
        "processed (224)": (final,      f"{stem}_processed.jpg"),
    }

    print(f"\n── Saved ──")
    for label, (img, fname) in paths.items():
        full_path = str(out_dir / fname)
        cv2.imwrite(full_path, to_bgr(img))
        print(f"  {label:<18s} → {full_path}")

    comp_out = str(out_dir / f"{stem}_compare.jpg")
    save_side_by_side(original, final, comp_out)
    print(f"  {'comparison':<18s} → {comp_out}")
    print()


if __name__ == "__main__":
    main()
