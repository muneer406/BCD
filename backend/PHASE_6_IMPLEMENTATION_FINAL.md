# BCD Backend – PHASE 6 IMPLEMENTATION (Model Reliability, Preprocessing Correction, and Model Upgrade)

Status: Phase 5 Complete  
Goal: Fix preprocessing mistakes, improve embedding correctness, and upgrade model capability.

This phase addresses critical preprocessing corrections and prepares the system for true model-level accuracy improvements.

This phase DOES NOT include medical diagnosis.

---

# PART 1 — CRITICAL CORRECTIONS FROM PREVIOUS PHASES

These issues were identified and must be corrected first.

---

## Issue 1 — Incorrect Orientation Detection

Previous attempts tried to detect orientation using:

- neck detection
- silhouette orientation
- angle guessing

This approach is incorrect.

Correct solution:

Use EXIF orientation only:

ImageOps.exif_transpose()

Do NOT attempt anatomical orientation detection.

Reason:

Capture flow already enforces correct orientation.

---

## Issue 2 — Incorrect Cropping Method

Previous:

Center crop entire image

Problem:

Subject may not be centered.

Correct solution:

Implement torso-region detection:

Steps:

- Convert image to grayscale
- Apply threshold
- Detect contours
- Select largest central contour
- Crop bounding box with padding

Goal:

Crop subject region, not arbitrary center.

---

## Issue 3 — Incorrect Histogram Equalization

Previous:

cv2.equalizeHist()

Problem:

Destroys local contrast detail.

Correct solution:

Use CLAHE:

cv2.createCLAHE()

Benefits:

Preserves structural detail.

---

## Issue 4 — Direct Resize to 224

Previous:

Resize full image directly to 224

Problem:

Destroys spatial detail.

Correct pipeline:

Crop subject → Resize 384 → Center crop 224

---

## Issue 5 — Missing Denoising

Add:

cv2.fastNlMeansDenoisingColored()

Removes sensor noise.

---

## Issue 6 — Missing Quality Scoring

Add:

Blur detection:

Variance of Laplacian

Brightness consistency scoring

Session quality score

Store:

image_quality_score

session_quality_score

---

# PART 2 — FINAL CORRECT PREPROCESSING PIPELINE

Final pipeline order:

Load image

Apply EXIF transpose

Denoise image

Apply CLAHE normalization

Detect torso bounding box

Crop torso region

Resize to 384×384

Center crop 224×224

Apply sharpening

Output for embedding extraction

---

# PART 3 — MODEL LIMITATIONS IDENTIFIED

Current model:

ResNet50 pretrained on ImageNet

Problem:

Not trained for breast-specific structural comparison

Limits accuracy

Must upgrade model.

---

# PART 4 — PHASE 6 PRIMARY OBJECTIVES

Phase 6 focuses on model upgrade and embedding quality.

---

## Objective 1 — Upgrade Backbone Model

Replace:

ResNet50

With one of:

EfficientNetV2 (recommended)

ConvNeXt

DINOv2

Priority:

EfficientNetV2 first

---

## Objective 2 — Fine-Tune Model on Relevant Data

Fine-tune embedding model using breast image datasets.

Recommended datasets:

BreastMNIST

CBIS-DDSM

INBreast

Goal:

Improve embedding relevance.

---

## Objective 3 — Improve Embedding Stability

Implement:

Embedding normalization per user

embedding = embedding − user_mean

Improves comparison stability.

---

## Objective 4 — Improve Comparison Logic

Current:

Compare to previous embedding

Upgrade:

Compare using:

Last session

Rolling baseline

Monthly baseline

Lifetime baseline

Angle-level comparison

---

## Objective 5 — Implement Confidence Estimation

Compute:

analysis_confidence_score

Based on:

Image quality

Embedding consistency

Angle consistency

---

# PART 5 — OPTIONAL ADVANCED IMPROVEMENTS

Future upgrades:

Background removal using segmentation

ONNX export for faster inference

GPU optimization

Batch embedding extraction

---

# PART 6 — WHAT NOT TO IMPLEMENT

Do NOT implement:

Cancer detection

Diagnosis

Risk classification

Medical prediction

---

# PHASE 6 COMPLETION CRITERIA

Phase 6 complete when:

New model integrated

Preprocessing corrected

Embeddings stable

Comparison logic reliable

Confidence scoring operational

---

# PHASE 6 OUTCOME

System becomes:

High reliability

Stable comparison engine

Ready for real-world validation

---

End of Document
