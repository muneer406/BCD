# BCD Backend – PHASE 4 IMPLEMENTATION (Final Updated)

Status: Phase 3 Complete (Embedding extraction operational)  
Goal: Improve correctness, reliability, preprocessing accuracy, and comparison logic

This phase focuses on making the system scientifically and technically reliable.

This phase DOES include preprocessing improvements, alignment, aggregation, and comparison.

This phase DOES NOT include diagnosis, classification, or medical prediction.

---

# Phase 4 Overview

Phase 4 has four core objectives:

1. Fix embedding comparison correctness
2. Improve preprocessing and alignment
3. Implement multi-image and multi-angle aggregation
4. Implement structured comparison layers

---

# Part 1 – Fix Embedding Comparison Bug (Critical)

Current issue:

Cosine distance is calculated against zero vector.

This produces invalid change scores.

Required fix:

Replace:

_cosine_distance(embedding, zero_vector)

With:

_cosine_distance(current_embedding, baseline_embedding)

Baseline definition:

If first session:

baseline = None
change_score = 0

If subsequent session:

baseline = rolling average of previous embeddings

---

# Part 2 – Improved Image Preprocessing Pipeline

This step improves embedding quality significantly.

Existing preprocessing must be extended.

Required improvements:

Image loading from Supabase Storage

Image normalization:

• Normalize pixel values to 0–1
• Apply histogram equalization

Image alignment:

• Center crop
• Remove background as much as possible
• Maintain consistent region-of-interest

Image resizing:

Resize to 224×224 resolution

Alignment must ensure anatomical consistency, not camera consistency.

---

# Part 3 – Multi-Image Per Angle Aggregation

Users may upload multiple images per angle.

Correct aggregation hierarchy:

Image → Angle → Session

Implementation steps:

Step 1 – Extract embedding per image

Step 2 – Compute angle embedding:

angle_embedding = mean(all image embeddings for that angle)

Step 3 – Compute session embedding:

session_embedding = mean(all angle embeddings)

Store:

angle embeddings in angle_analysis table

session embedding in session_embeddings table

---

# Part 4 – Structured Comparison Layers

Implement following comparisons:

---

Comparison 1 – Immediate Change

current session vs previous session

---

Comparison 2 – Rolling Baseline

current session vs average of last 3–5 sessions

---

Comparison 3 – Monthly Baseline

current session vs average of last 30 days

(if sufficient data exists)

---

Comparison 4 – Lifetime Baseline

current session vs average of all previous sessions

---

Comparison 5 – Angle-Level Comparison

For each angle:

compare current angle embedding vs previous angle embedding

---

# Part 5 – Trend Stability

Track historical change scores

Compute moving average:

trend_score = average(last 5 change scores)

Store trend score

---

# Part 6 – API Response Update

Extend analysis response to include:

Angle-level change scores

Session-level change score

Rolling baseline comparison

Monthly comparison

Lifetime comparison

Trend score

---

# Part 7 – Database Requirements

Ensure storage for:

angle embeddings

session embeddings

comparison scores

trend scores

Embeddings must never be exposed publicly.

---

# Part 8 – Engineering Rules

Always use rolling baseline

Always aggregate image → angle → session

Never compare against zero vector

Never classify medical condition

Never implement diagnosis logic

---

# Phase 4 Completion Criteria

Phase 4 is complete when:

Preprocessing pipeline produces stable inputs

Embedding aggregation implemented correctly

Comparison layers operational

Trend smoothing operational

Change scores reflect real embedding differences

---

# Phase 4 Outcome

System produces scientifically meaningful change tracking.

Backend ready for model refinement phase.

---

End of Document
