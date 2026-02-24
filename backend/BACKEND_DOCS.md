# BCD Backend — Complete Documentation

**Version:** 0.2.0  
**Framework:** FastAPI (Python)  
**Runtime:** Uvicorn ASGI  
**Database:** Supabase (PostgreSQL via Supabase Python SDK)  
**Storage:** Supabase Storage (`bcd-images` bucket)  
**Auth:** Supabase JWTs (ES256 algorithm, JWKS verification)  
**ML:** PyTorch EfficientNetV2-S (1280-dim embeddings), OpenCV (CLAHE, contour crop, denoise, sharpen)  
**Rate Limiting:** slowapi 0.1.9 (20 analyses/day per IP, configurable)  
**Deployment:** Hugging Face Spaces Docker (`https://muneer320-bcd-backend.hf.space`), port 7860  
**Frontend:** React/Vite/TypeScript on Vercel (`VITE_API_URL` env var)  
**Base URL (dev):** `http://localhost:8000` — prefix all routes with `/api`  
**Interactive Docs (dev):** `http://localhost:8000/api/docs`

---

## Directory Structure

```
backend/
├── .env                          # Secret env vars — NOT in git
├── requirements.txt              # All Python dependencies
├── Dockerfile                    # Multi-stage CPU-only PyTorch image, port 7860
├── docker-compose.yml            # Local Docker compose for testing
├── .dockerignore                 # Excludes .venv, __pycache__, tests, etc.
├── Procfile                      # HF Spaces process definition: uvicorn on port 7860
├── README.md                     # HF Spaces frontmatter + deployment notes
│
├── PHASE3_MIGRATION.sql          # DB: add user_id to session_embeddings
├── PHASE4_MIGRATION.sql          # DB: angle_embeddings table + session_analysis trend columns
├── PHASE5_MIGRATION.sql          # DB: pgvector vector(2048) columns, quality scores, analysis_logs
├── PHASE6_MIGRATION.sql          # DB: DESTRUCTIVE — clears 2048-dim data, installs vector(1280) + HNSW indexes
├── PHASE7_MIGRATION.sql          # DB: angle_aware_score + analysis_version on session_analysis; confidence_score on analysis_logs
│
├── PHASE_6_IMPLEMENTATION_FINAL.md  # Phase 6 spec (preprocessing rewrite decisions)
├── BACKEND_DOCS.md               # This file
│
└── scripts/
    └── dataset_export.py         # Phase 7B: exports all captured images + metadata to disk for dataset collection
│
├── app/
│   ├── main.py                   # FastAPI app entrypoint — logging, CORS, rate limiting, routers
│   ├── config.py                 # Settings loader (reads .env via python-dotenv)
│   ├── dependencies.py           # FastAPI dependencies: get_current_user
│   ├── limiter.py                # Shared slowapi Limiter singleton (avoids circular imports)
│   │
│   ├── api/                      # HTTP route handlers (thin controllers — validation + delegation only)
│   │   ├── analyze_session.py    # POST /api/analyze-session/{session_id}
│   │   ├── analyze_status.py     # GET  /api/analyze-status/{session_id}
│   │   ├── compare_sessions.py   # POST /api/compare-sessions/{current}/{previous}
│   │   ├── session_analysis.py   # GET  /api/sessions/{session_id}/analysis
│   │   ├── generate_report.py    # POST /api/generate-report/{session_id}
│   │   └── utility.py            # GET  /api/image-preview, /session-info, /session-thumbnails
│   │
│   ├── services/                 # Business logic and DB access
│   │   ├── db.py                 # Supabase client factory
│   │   ├── session_service.py    # get_session() helper
│   │   ├── image_service.py      # get_session_images() helper
│   │   ├── analysis_service.py   # Full ML pipeline: preprocess → embed → score → per-angle baselines → store
│   │   ├── comparison_service.py # Compare two sessions across 5 structured layers
│   │   ├── analysis_fetch_service.py # Read stored analysis back from DB (no ML)
│   │   └── report_service.py     # Stub — returns hardcoded summary, no real report yet
│   │
│   ├── processing/               # Low-level ML / CV operations
│   │   ├── preprocessing.py      # Phase 6: 8-step pipeline
│   │   ├── quality.py            # Image quality scoring — blur, brightness, confidence, variation level
│   │   └── embedding.py          # EfficientNetV2-S (1280-dim) singleton, ImageNet pre-trained weights
│   │
│   └── utils/
│       └── security.py           # JWT decode + JWKS fetch with 1hr in-memory cache
│
├── tests/
│   ├── conftest.py               # sys.path setup so `app.*` imports resolve from the backend root
│   ├── test_quality.py           # 42 unit tests — quality.py functions + Phase 6 preprocessing steps
│   └── test_api.py               # 13 integration tests — all DB/ML/storage calls mocked
│
└── tools/
    └── preview_preprocessing.py  # Dev-only: run Phase 6 pipeline on a local file, save step-by-step output images
```

**Deleted in Phase 5:**

- `app/processing/session_analysis.py` — was a dead stub; removed
- `app/processing/trend_analysis.py` — was a dead stub; removed

---

## Environment Variables (`.env`)

> `.env` is gitignored. **Never commit it.** A new developer must create it manually.

| Variable                      | Example value                              | Purpose                                                          |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `SUPABASE_URL`                | `https://vtpgeaqhkbbpvaigxwgq.supabase.co` | Supabase project URL                                             |
| `SUPABASE_SERVICE_ROLE_KEY`   | `eyJhbG...` (long JWT)                     | Bypasses RLS — backend only, **never sent to frontend**          |
| `JWT_ALGORITHM`               | `ES256`                                    | Supabase uses ES256 (Elliptic Curve), **not** RS256              |
| `API_HOST`                    | `0.0.0.0`                                  | Bind address for uvicorn                                         |
| `API_PORT`                    | `8000`                                     | Port (HF Spaces Docker overrides this to 7860 in Dockerfile CMD) |
| `API_PREFIX`                  | `/api`                                     | All routes prefixed here                                         |
| `ALLOWED_ORIGINS`             | `*` (dev) / `https://yourapp.com` (prod)   | CORS origins — comma-separated list or `*`                       |
| `RATE_LIMIT_ANALYSIS_PER_DAY` | `20`                                       | Max `analyze-session` calls per day per IP                       |

**Auto-derived (no need to set):** `SUPABASE_JWKS_URL` — `config.py` builds it as `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` if absent.

**Declared but unused:** `SUPABASE_JWT_PUBLIC_KEY` — leftover from the old RS256 approach; kept in `Settings` dataclass to avoid errors if it appears in `.env`.

---

## How to Run

### Local (development)

```powershell
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Server starts at `http://localhost:8000`. `--reload` restarts on file changes.

### Docker (local testing)

```powershell
cd backend
docker compose up --build
```

Maps container port 7860 to host port 7860.

### HF Spaces (production)

Deployed automatically via `.github/workflows/sync-hf.yml`, which pushes `backend/` to the `muneer320/bcd-backend` HF Space repository on every push to `master` using `HF_TOKEN` (a Hugging Face write token stored as a GitHub secret). HF Spaces builds the Docker image and starts uvicorn on port 7860.

---

## Authentication Flow

Every endpoint (except `GET /`) requires a valid Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <supabase-access-token>
```

Flow:

1. Frontend calls `supabase.auth.getSession()` to obtain the access token
2. Frontend includes it as `Authorization: Bearer <token>` on every API request
3. Backend `get_current_user()` dependency (`dependencies.py`) extracts the Bearer token
4. `security.py` fetches JWKS from Supabase (cached for 1 hour), finds the matching key by `kid`, and verifies the JWT signature using `python-jose`
5. If valid → returns `{"user_id": str, "role": str, "email": str}` to the route handler
6. If missing, malformed, or signature-invalid → `401 Unauthorized`

**Why `verify_aud: False`:** Supabase JWTs have `aud: "authenticated"`. python-jose's audience check requires the expected audience be passed explicitly. Disabling it is safe because the signature is still fully cryptographically verified.

**JWKS cache:** Keys fetched once are reused for up to 3600 seconds. On `kid` mismatch (key rotation), the cache is busted and JWKS is re-fetched once.

---

## API Endpoints

### `GET /`

**File:** `app/main.py` | **Auth:** None  
Legacy health check — returns `{"status": "ok"}`

---

### `GET /health`

**File:** `app/main.py` | **Auth:** None  
Explicit health check for load-balancers, uptime monitors, and Hugging Face Spaces. Returns `{"status": "ok"}`.

---

### `POST /api/analyze-session/{session_id}`

**File:** `app/api/analyze_session.py` | **Auth:** Required  
**Rate limit:** 20 requests/day per IP (configurable via `RATE_LIMIT_ANALYSIS_PER_DAY`)  
**Query params:**

- `?async_process=false` — default sync mode; `true` for background processing
- `?force=true` — bypass cache and re-run the full ML pipeline

**What it does (sync mode, cache miss):**

1. Validates the session exists and belongs to the authenticated user
2. Checks `session.status == "completed"` (frontend must mark session complete before calling)
3. Fetches image records via `get_session_images()`
4. Requires **at least 3 angles** — returns 400 if fewer (full set is `{front, left, right, up, down, raised}` but 3 minimum is accepted)
5. **Cache check:** If analysis rows already exist in `session_analysis` AND `?force=true` is NOT set → returns the stored result immediately with `from_cache: true`, skipping ML entirely
6. Calls `analysis_service.analyze_session()` — full Phase 6 ML + quality pipeline
7. Persists results to `angle_analysis` and `session_analysis` tables (idempotent: delete-then-insert)
8. Returns analysis JSON including Phase 5 trust/quality fields

**Async mode** (`?async_process=true`): Registers the job in the in-process `_analysis_jobs` dict, enqueues it as a FastAPI `BackgroundTask`, and returns `{"status": "processing"}` immediately. Poll `GET /api/analyze-status/{session_id}` for completion.

**Response (sync, cache miss):**

```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "overwritten": false,
    "from_cache": false,
    "is_first_session": false,
    "session_analysis": {
      "per_angle": [
        {
          "angle_type": "front",
          "change_score": 0.42,
          "variation_level": "Moderate Variation",
          "angle_quality_score": 0.78,
          "image_quality": [
            {
              "blur_score": 300.0,
              "brightness": 0.5,
              "is_blurry": false,
              "is_too_dark": false,
              "is_too_bright": false,
              "quality_score": 0.78
            }
          ],
          "summary": "Distance-based analysis for front angle."
        }
      ],
      "overall_summary": "ML analysis complete. Scores reflect distance from your personal baseline."
    },
    "scores": {
      "change_score": 0.42,
      "variation_level": "Moderate Variation",
      "trend_score": 0.38,
      "analysis_confidence_score": 0.82,
      "session_quality_score": 0.77,
      "angle_aware_score": 0.39,
      "angle_aware_variation_level": "Mild Variation",
      "analysis_version": "v0.7"
    },
    "image_quality_summary": {
      "session_quality_score": 0.77,
      "analysis_confidence_score": 0.82,
      "consistency_score": 0.95,
      "low_quality_angles": [],
      "blurry_images_count": 0,
      "total_images": 6
    },
    "baseline_used": "lifetime_mean",
    "comparison_layers_used": ["lifetime_baseline"],
    "processing_time_ms": 2500
  }
}
```

**Response (cache hit):** Same shape but `from_cache: true`, `overwritten: false`. The `image_quality_summary`, `baseline_used`, `comparison_layers_used`, and `processing_time_ms` fields are omitted (only stored scores are returned). `is_first_session` is inferred: `overall_score == 0.0 AND trend_score == null`.

**First session:** `is_first_session: true`, `change_score: 0.0`, `trend_score: null`, `overall_summary: "Baseline established."` All change scores are 0.0 — no prior baseline to compare against.

**Known limitation:** `per_angle[].summary` always says `"Distance-based analysis for {angle} angle."` — not generated by a language model.

**Used by:** `frontend/src/pages/Result.tsx`

---

### `GET /api/analyze-status/{session_id}`

**File:** `app/api/analyze_status.py` | **Auth:** Required

Polls the status of an async analysis job.

**Check order:**

1. In-memory `_analysis_jobs` registry (imported from `analyze_session.py`) — most accurate for recently-queued jobs
2. `session_analysis` DB table — catches jobs completed before in-memory state was queried
3. Neither found → `not_started`

**Response:**

```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "status": "completed",
    "error": null
  }
}
```

**Status values:**

| Value         | Meaning                                                     |
| ------------- | ----------------------------------------------------------- |
| `not_started` | No job found in registry and no DB row exists               |
| `processing`  | Background job is running                                   |
| `completed`   | Job finished successfully (DB row confirmed)                |
| `failed`      | Job threw an exception; `error` contains the message string |

---

### `POST /api/compare-sessions/{current_session_id}/{previous_session_id}`

**File:** `app/api/compare_sessions.py` | **Auth:** Required

Compares two sessions using stored embeddings and per-angle scores across 5 structured layers.

**Preconditions:** Both sessions must exist, belong to the user, have `status == "completed"`, and have been previously analyzed. Returns 400 if both IDs are the same. Raises 404 if `angle_analysis` rows are missing.

**Response:**

```json
{
  "success": true,
  "data": {
    "per_angle": [
      {
        "angle_type": "front",
        "current_score": 0.45,
        "previous_score": 0.42,
        "delta": 0.03,
        "delta_magnitude": 0.03,
        "embedding_distance": 0.11,
        "variation_level": "Stable"
      }
    ],
    "overall_delta": 0.07,
    "stability_index": 0.93,
    "overall_trend": "stable",
    "overall_variation_level": "Stable",
    "comparison_method": "embedding",
    "rolling_baseline": {
      "delta": 0.09,
      "trend": "stable",
      "variation_level": "Stable",
      "available": true
    },
    "monthly_baseline": {
      "delta": 0.09,
      "trend": "stable",
      "variation_level": "Stable",
      "available": true
    },
    "lifetime_baseline": {
      "delta": 0.09,
      "trend": "stable",
      "variation_level": "Stable",
      "available": true
    },
    "baseline_used": "session_embeddings",
    "comparison_layers_used": ["immediate", "rolling", "monthly", "lifetime"],
    "processing_time_ms": 120
  }
}
```

`available: false` (with `delta: null`, `trend: null`, `variation_level: null`) is returned for baselines with insufficient data.

**Fallback:** If session embeddings are missing, `overall_delta` = mean of per-angle score deltas. `comparison_method` = `"score"`.

**Used by:** `frontend/src/pages/Result.tsx`

---

### `GET /api/session-info/{session_id}`

**File:** `app/api/utility.py` | **Auth:** Required

Returns metadata about a session.

**DB queries (4):** ownership verify; total `sessions` count; oldest session (for `is_first_session`); two most recent sessions (for `is_current` and `previous_session_id`).

**Response:**

```json
{
  "session_id": "uuid",
  "is_first_session": false,
  "is_current": true,
  "total_sessions": 3,
  "created_at": "2026-02-16T10:00:00Z",
  "previous_session_id": "prev-uuid"
}
```

`previous_session_id` is the **second most recent** session, used as comparison target. `null` if this is the first session.

**Used by:** `frontend/src/lib/apiClient.ts` → `apiClient.getSessionInfo()` → `Result.tsx`

---

### `GET /api/image-preview/{session_id}/{image_type}`

**File:** `app/api/utility.py` | **Auth:** Required

Generates a 1-hour signed URL for a single image from Supabase Storage. Service role key used server-side — never exposed to the frontend.

`image_type` values: `front`, `left`, `right`, `up`, `down`, `raised`

**Response:**

```json
{
  "preview_url": "https://vtpgeaqhkbbpvaigxwgq.supabase.co/storage/v1/object/sign/...",
  "expires_in": 3600,
  "image_type": "front"
}
```

**SDK quirk:** The Supabase Python SDK returns the URL in different formats depending on version (either `{"signedUrl": "..."}` directly, or wrapped in a `.data` attribute). Both are handled.

**Used by:** `apiClient.getImagePreview()` → `Result.tsx` (6 parallel calls)

---

### `GET /api/session-thumbnails/{session_id}`

**File:** `app/api/utility.py` | **Auth:** Required

Batch version of image-preview — signed URLs for all images in one request.

**Response:** `{"session_id": "uuid", "thumbnails": {"front": "...", ...}, "count": 6}`

**Status:** Implemented and working. **Not currently called by any frontend page.**

---

### `GET /api/sessions/{session_id}/analysis`

**File:** `app/api/session_analysis.py` | **Auth:** Required

Read back stored analysis from DB without re-running ML. Returns 404 if never analyzed.

**Response:** `{"success": true, "data": {"session_analysis": {"session_id": ..., "overall_change_score": ..., "trend_score": ..., "created_at": ..., "per_angle": [...]}}}`

**Status:** Implemented. **Not currently called anywhere in the frontend.**

---

### `POST /api/generate-report/{session_id}`

**File:** `app/api/generate_report.py` | **Auth:** Required  
**⚠️ STUB.** Returns the stored analysis rows with a hardcoded `"Placeholder report generated from stored analysis."` summary. No PDF, no email, no real report logic.

---

## Processing Layer

### `processing/quality.py`

Pure quality-scoring module. No ML — OpenCV only.

**`ImageQuality` dataclass:**

| Field           | Type    | Description                                                        |
| --------------- | ------- | ------------------------------------------------------------------ |
| `blur_score`    | `float` | Laplacian variance of the image. Higher = sharper. Threshold: 80.0 |
| `brightness`    | `float` | Mean pixel value in [0, 1]                                         |
| `is_blurry`     | `bool`  | `True` if `blur_score < 80.0`                                      |
| `is_too_dark`   | `bool`  | `True` if `brightness < 0.15`                                      |
| `is_too_bright` | `bool`  | `True` if `brightness > 0.90`                                      |
| `quality_score` | `float` | Composite [0,1]: 60% blur + 40% brightness                         |

**Quality score formula:**

```
blur_component       = min(1.0, blur_score / 400)
brightness_component = 1.0 - abs(brightness - 0.5) / 0.5
quality_score        = 0.6 * blur_component + 0.4 * brightness_component
```

**Functions:**

| Function                                                                | Description                                                                                                     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `compute_image_quality(image)`                                          | Per-image quality from a float32 [0,1] 224×224 image                                                            |
| `compute_session_quality(angle_quality_scores)`                         | Mean of per-angle scores × coverage factor (÷ 6 angles). Penalises partial sessions.                            |
| `compute_consistency_score(angle_change_scores)`                        | `max(0, 1 - std/0.5)` — uniformity of change scores across angles. 1.0 = identical scores.                      |
| `compute_analysis_confidence(quality, consistency, n_angles, is_first)` | Weighted: 40% quality + 30% consistency + 20% coverage + 10% history (history component = 0.7 if first session) |
| `variation_level(score)`                                                | Maps cosine distance to a neutral label (see table below)                                                       |

**`variation_level` labels** — deliberately non-medical language:

| Score range | Label              |
| ----------- | ------------------ |
| 0.00 – 0.10 | Stable             |
| 0.10 – 0.25 | Mild Variation     |
| 0.25 – 0.45 | Moderate Variation |
| 0.45 – 0.70 | Higher Variation   |
| 0.70 – 1.00 | Strong Variation   |

Words like "risk", "abnormal", "suspicious", "concerning" are explicitly excluded — enforced by a unit test.

---

### `processing/preprocessing.py` — Phase 6 rewrite

8-step pipeline. Returns `PreprocessResult(image: np.ndarray, quality: ImageQuality)` where `image` is float32 [0,1] shape (224, 224, 3).

**Constants:**

| Constant            | Value | Purpose                          |
| ------------------- | ----- | -------------------------------- |
| `PRE_DENOISE_MAX`   | 640   | Max dimension before NLMeans     |
| `INTERMEDIATE_SIZE` | 384   | Resize target before centre-crop |
| `TARGET_SIZE`       | 224   | Final model input size           |

**Pipeline:**

| Step | Function                                  | What it does                                                                                                                                                | Why                                                                                                                                            |
| ---- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `load_image_from_storage(path, supabase)` | Downloads from Supabase Storage, `ImageOps.exif_transpose()`, converts to RGB uint8                                                                         | EXIF-only orientation — guided capture guarantees correct phone orientation; silhouette-based auto-orient was removed in Phase 6 (added noise) |
| 1b   | `fast_downscale(image, max_dim=640)`      | Downscales to ≤640px on longest side if larger; returns uint8                                                                                               | `fastNlMeansDenoisingColored` on a 4K phone photo took 30–90 seconds. At ≤640px it takes ~0.1 seconds. **Biggest single performance fix.**     |
| 2    | `denoise_image(image)`                    | `cv2.fastNlMeansDenoisingColored(h=6, hColor=6, templateWindowSize=7, searchWindowSize=21)`. Always returns uint8.                                          | Removes sensor/compression noise before feature extraction                                                                                     |
| 3    | `apply_clahe(image)`                      | Convert to LAB, CLAHE (clipLimit=2.0, tileGridSize=8×8) on L channel, back to RGB float32 [0,1]                                                             | Replaces old `cv2.equalizeHist` — CLAHE preserves local contrast; global equalisation over-amplifies bright phone photos                       |
| 4    | `detect_torso_crop(image)`                | Adaptive threshold → contours → largest contour in central band (20–80% width, ≥5% area) → crop + 5% padding; fallback to full image if no suitable contour | Replaces blind centre-crop; isolates the torso region and reduces uninformative background proportion                                          |
| 5    | `resize_intermediate(image, size=384)`    | `INTER_LANCZOS4` resize to 384×384; returns float32                                                                                                         | Two-step resize avoids distortion from directly resizing to 224×224; Lanczos4 preserves edge detail                                            |
| 6    | `center_crop_final(image, size=224)`      | Centre-crop 384×384 → 224×224; returns float32                                                                                                              | Discards outermost resize-distorted pixels; model input size                                                                                   |
| 7    | `sharpen_image(image)`                    | Unsharp mask: `clip(1.8×img − 0.8×GaussianBlur(img, σ=1.5))`; accepts and returns float32 or uint8                                                          | Restores edge detail softened by Lanczos resize                                                                                                |
| 8    | `compute_image_quality(image)`            | Quality metrics on the final 224×224                                                                                                                        | Assesses exactly what the model sees                                                                                                           |

---

### `processing/embedding.py` — Phase 6 upgrade

EfficientNetV2-S feature extractor.

| Property          | Detail                                                                                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model             | `efficientnet_v2_s(weights=DEFAULT)` — classifier replaced with `torch.nn.Identity()`                                                                                                                                                                                                                            |
| Output            | **1280-dim** float32 vector (was 2048-dim with ResNet50)                                                                                                                                                                                                                                                         |
| Device            | CUDA if available, else CPU                                                                                                                                                                                                                                                                                      |
| Singleton         | `get_encoder()` creates `_encoder` once; first call ~2–4 seconds                                                                                                                                                                                                                                                 |
| Transforms        | `ToTensor()` + `Normalize([0.485,0.456,0.406], [0.229,0.224,0.225])`                                                                                                                                                                                                                                             |
| `EMBEDDING_DIM`   | `1280`                                                                                                                                                                                                                                                                                                           |
| `user_mean` param | **UNUSED / NO-OP.** `extract_embedding(image, user_mean=None)` — kept for API compatibility but does nothing. Previously subtracted the user's lifetime mean before returning, which caused identical images to score ~1.0 cosine distance from themselves (mean subtraction breaks cosine similarity). Removed. |

**Why EfficientNetV2-S:** 15% fewer parameters than ResNet50, higher ImageNet accuracy, better surface-texture representations at lower compute cost. Output dimension change (2048 → 1280) required `PHASE6_MIGRATION.sql` to wipe all stored embeddings.

**Why ImageNet weights (no fine-tuning):** No public domain-specific labelled dataset exists for sequential visible-light phone photos of the external chest surface. Candidate datasets from Phase 6 spec:

| Dataset     | Modality               | Why incompatible                                               |
| ----------- | ---------------------- | -------------------------------------------------------------- |
| BreastMNIST | Ultrasound (greyscale) | Internal tissue echograms — no colour, no surface, no lighting |
| CBIS-DDSM   | Mammography X-ray      | X-ray density of internal tissue — invisible in visible light  |
| INBreast    | Mammography X-ray      | Same as above                                                  |

Fine-tuning on these would actively degrade embedding quality. ImageNet transfers well for surface-appearance tasks.

---

## Services Layer

### `services/db.py`

`get_supabase_client() → Client` — creates a new Supabase client per call using service role key. No pooling needed (HTTP-based API).

---

### `services/session_service.py`

`get_session(session_id, user_id) → dict` — queries `sessions` table filtered by both `id` and `user_id`. Returns `{}` if not found (not `None`).

---

### `services/image_service.py`

`get_session_images(session_id, user_id) → list[dict]` — returns `{id, image_type, storage_path, created_at}` for all images in the session.

---

### `services/analysis_service.py` — Core ML pipeline

**`analyze_session(images, user_id, session_id) → dict`**

Aggregation: `image → angle embedding (mean of images per angle) → session embedding (mean of angle embeddings)`

**Internal helpers:**

| Helper                                                           | Description                                                                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `_parse_embedding(raw)`                                          | Parses DB embedding: handles JSON string, list, or None → `np.float32` array                                      |
| `_cosine_distance(a, b)`                                         | `1 − cosine_similarity(a, b)`. Returns 1.0 if either vector is zero-norm.                                         |
| `_load_user_baseline(user_id, exclude_session_id)`               | Mean of ALL prior session embeddings (session-level). Returns `None` if first session.                            |
| `_load_per_angle_baselines(user_id, exclude_session_id)`         | Per-angle mean embeddings from `angle_embeddings` table, grouped by `angle_type`. Returns `{}` if first session.  |
| `_load_trend_score(user_id, exclude_session_id, n=5)`            | Moving average of last 5 sessions' `overall_change_score`. Returns `None` if no history.                          |
| `_store_angle_embeddings(session_id, user_id, angle_embeddings)` | Delete-then-insert to `angle_embeddings` table. Silently skips if table doesn't exist (PHASE4 migration not run). |
| `_store_session_embedding(session_id, user_id, embedding)`       | Delete-then-insert to `session_embeddings` table.                                                                 |

**Pipeline steps:**

1. Load `user_baseline` (session-level) and `per_angle_baselines` (angle-level)
2. Group images by `angle_type`
3. **Parallel processing** via `ThreadPoolExecutor(max_workers=min(n_angles, 6))` — one thread per angle, each with its own Supabase client
4. Per thread: `preprocess_pipeline()` for each image → `extract_embedding()` → mean angle embedding → `angle_quality_score`
5. **Per-angle baseline comparison:** `angle_baseline = per_angle_baselines.get(angle_type, user_baseline)` — uses angle-specific prior mean if available, else session-level fallback. This is the critical fix: front scores compare against prior fronts, not a blended session mean.
6. `change_score = cosine_distance(angle_embedding, angle_baseline)` (0.0 if first session)
7. Session embedding = mean of angle embeddings
8. Store both sets of embeddings
9. `overall_change_score` = cosine distance between session embedding and `user_baseline`
10. Compute `trend_score`, `session_quality_score`, `consistency_score`, `analysis_confidence_score`

**Phase 7 additions to the pipeline:**

- **`ANALYSIS_VERSION = "v0.7"`** constant (defined at module level after logger) — included in every return dict.
- **Step 8b — `angle_aware_score`:** After per-angle scores are collected, `angle_aware_score = float(np.mean(angle_change_scores_list))`. This is the mean of per-angle cosine distances and is **angle-assignment-sensitive** (i.e. swapping angle labels changes it). Distinct from `overall_change_score`, which is the cosine distance between the session embedding (mean of angle embeddings — order-invariant) and the baseline. Previously `overall_change_score` could be 0.00 even when individual angles showed variation, because session embedding averaging collapsed them.
- **Step 10 — `analysis_logs` write:** After all scores are computed, writes `{session_id, user_id, processing_time_ms, status: "completed", confidence_score: analysis_confidence_score}` to the `analysis_logs` table. Wrapped in `try/except` — gracefully skipped if the table or `confidence_score` column doesn't exist (PHASE5/7 migration not yet run).

**Return dict keys:** `per_angle`, `overall_summary`, `scores`, `image_quality_summary`, `baseline_used`, `comparison_layers_used`, `processing_time_ms`

**`scores` dict keys (Phase 7):** `change_score`, `variation_level`, `trend_score`, `analysis_confidence_score`, `session_quality_score`, `angle_aware_score`, `angle_aware_variation_level`, `analysis_version`

**Key decision — why per-angle baselines matter:** The original system blended all 6 angle embeddings into a single session mean and compared every angle against that blend. This means a front-view embedding was being compared against a blend of front, left, right, up, down, and raised views — a category error. With per-angle baselines, each angle's historical mean is computed independently, making change scores anatomically meaningful.

---

### `services/comparison_service.py` — 5-layer comparison

**`compare_sessions(current, previous, user_id) → dict`**

| Layer         | Description                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| 1 – Immediate | `cosine_distance(current_emb, previous_emb)`                                                                   |
| 2 – Rolling   | `cosine_distance(current_emb, mean_of_last_5_prior_session_embs)`                                              |
| 3 – Monthly   | `cosine_distance(current_emb, mean_of_last_30_days_session_embs)`                                              |
| 4 – Lifetime  | `cosine_distance(current_emb, mean_of_ALL_prior_session_embs)`                                                 |
| 5 – Per-angle | Per-angle `cosine_distance(current_angle_emb, previous_angle_emb)` + numeric score delta from `angle_analysis` |

For per-angle results: `delta = current_score - previous_score`, `delta_magnitude = abs(delta)`, `variation_level = variation_level(delta_magnitude)`.

Trend labels: `stable` (< 0.1), `mild_variation` (< 0.25), `significant_shift` (≥ 0.25).
`stability_index = max(0, min(1, 1 - overall_delta))`.

**Raises `ValueError`** if `angle_analysis` rows are missing for either session — propagated as 404 by the API handler. All baseline layers return `null` gracefully if data is insufficient.

---

### `services/analysis_fetch_service.py`

`get_session_analysis(session_id, user_id) → dict`

Read-only. Queries `session_analysis` (`overall_change_score, trend_score, created_at, angle_aware_score, analysis_version`) and `angle_analysis` (`angle_type`, `change_score`, `summary`, `angle_quality_score`). Returns `{}` if no rows.

Return dict includes: `overall_change_score`, `trend_score`, `created_at`, `angle_aware_score`, `analysis_version`, `per_angle`.

---

### `services/report_service.py`

`generate_report(session_id, user_id) → dict` — **Stub.** Same reads as `analysis_fetch_service` + `summary: "Placeholder report generated from stored analysis."`. Needs real implementation.

---

## `app/main.py` — Application Entry Point

**Logging:** `logging.config.dictConfig` at startup. `uvicorn.access` suppressed. All `app.*` loggers produce timestamped structured output.

**CORS:** Reads `ALLOWED_ORIGINS`. When `"*"`, `allow_credentials=False` is automatically set. In production: set to the Vercel deployment URL.

**Rate limiting:** `SlowAPIMiddleware` registered with the shared `Limiter`. `POST /api/analyze-session` is the only rate-limited route.

**Global exception handler:** Forces 500 responses through FastAPI's pipeline so CORS headers are applied. Without this, 500s from unhandled exceptions would be generated by Starlette's `ServerErrorMiddleware` (above CORS middleware), producing opaque network errors to the frontend.

**Routers:**

| Router                    | Module                 | Tag          |
| ------------------------- | ---------------------- | ------------ |
| `analyze.router`          | `api.analyze_session`  | `analysis`   |
| `status.router`           | `api.analyze_status`   | `analysis`   |
| `compare.router`          | `api.compare_sessions` | `comparison` |
| `report.router`           | `api.generate_report`  | `reports`    |
| `session_analysis.router` | `api.session_analysis` | `analysis`   |
| `utility.router`          | `api.utility`          | `utility`    |

---

## `app/limiter.py`

Shared `Limiter(key_func=get_remote_address)` singleton. Exists to prevent a circular import between `main.py` (registers exception handler) and `api/analyze_session.py` (applies decorator). Falls back to `_NoOpLimiter` if slowapi is not installed.

---

## Database

### Tables

| Table                | Purpose                           | Key columns                                                                                                                                                                       |
| -------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `sessions`           | Session records                   | `id`, `user_id`, `status`                                                                                                                                                         |
| `images`             | Per-angle image records           | `id`, `session_id`, `user_id`, `image_type`, `storage_path`                                                                                                                       |
| `session_analysis`   | Per-session analysis results      | `session_id`, `user_id`, `overall_change_score`, `trend_score`, `analysis_confidence_score`, `session_quality_score`, `angle_aware_score` (Phase 7), `analysis_version` (Phase 7) |
| `angle_analysis`     | Per-angle results                 | `session_id`, `user_id`, `angle_type`, `change_score`, `summary`, `angle_quality_score`                                                                                           |
| `session_embeddings` | Session-level 1280-dim embeddings | `session_id`, `user_id`, `embedding` (JSON text), `embedding_vector` (vector(1280))                                                                                               |
| `angle_embeddings`   | Per-angle 1280-dim embeddings     | `session_id`, `user_id`, `angle_type`, `embedding` (JSON text), `embedding_vector` (vector(1280))                                                                                 |
| `analysis_logs`      | Per-analysis processing metadata  | `session_id`, `user_id`, `processing_time_ms`, `status`, `error_message`, `confidence_score` (Phase 7), `created_at`                                                              | Written to by `analysis_service.py` (Phase 7). |

**RLS:** All backend tables have `ENABLE ROW LEVEL SECURITY` with `USING (false)` policies — block all public access. The service role key bypasses RLS entirely.

### Embedding Storage

Stored in `embedding` (JSON text column). Parsing:

```python
if isinstance(raw, str):
    raw = json.loads(raw)
return np.array(raw, dtype=np.float32)
```

The `embedding_vector vector(1280)` column and HNSW index exist for future ANN search but are not yet used by the application code.

### Migration History

| File                      | What it does                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_MIGRATIONS.sql` | Initial: `sessions`, `images`, `session_analysis`, `angle_analysis`, `session_embeddings`                                                                                                       |
| `PHASE3_MIGRATION.sql`    | Adds `user_id` + index to `session_embeddings`; RLS policies                                                                                                                                    |
| `PHASE4_MIGRATION.sql`    | Creates `angle_embeddings` table + indexes; adds trend/baseline score columns to `session_analysis`                                                                                             |
| `PHASE5_MIGRATION.sql`    | `vector` extension; `embedding_vector vector(2048)` on both embedding tables; `analysis_confidence_score`, `session_quality_score` columns; `angle_quality_score` column; `analysis_logs` table |
| `PHASE6_MIGRATION.sql`    | **DESTRUCTIVE:** clears all stored 2048-dim embeddings; replaces `embedding_vector vector(2048)` with `vector(1280)`; creates HNSW cosine-distance indexes                                      |
| `PHASE7_MIGRATION.sql`    | Adds `angle_aware_score FLOAT` and `analysis_version TEXT DEFAULT 'v0.7'` to `session_analysis`; adds `confidence_score FLOAT` to `analysis_logs`                                               |

After `PHASE6_MIGRATION.sql`: all stored embeddings are wiped. All users must re-submit their sessions.

---

## Security & Production

### CORS

```
ALLOWED_ORIGINS=https://bcd-frontend.vercel.app
```

In dev (`"*"`), `allow_credentials=False` is set automatically.

### Rate Limiting

`POST /api/analyze-session` only: 20/day per IP. All other endpoints are unlimited.

### Service Role Key

Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code, browser logs, or client-side env vars. Backend-only.

---

## Tests

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/ -v
```

**55 tests — all passing.**

| File                    | Count | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/test_quality.py` | 42    | `variation_level` (15 parametrised + no-medical-language); `compute_image_quality` (sharp/blurry/dark/bright/bounds); `compute_session_quality` (full/partial/empty/bounds); `compute_consistency_score` (identical/high-variance/single/empty/bounds); `compute_analysis_confidence` (first vs returning / full vs partial coverage / high vs low quality / bounds / perfect); `PreprocessResult` dataclass; all 6 Phase 6 preprocessing steps (denoise/CLAHE/torso-crop/resize_intermediate/center_crop/sharpen) with dtype/shape/range assertions; full pipeline chain |
| `tests/test_api.py`     | 13    | Health check; analyze-session (200, required fields, `variation_level`, `analysis_confidence_score`, `session_quality_score`, `image_quality_summary`); analyze-status (all 4 statuses); compare-sessions (200, trust fields, per-angle `variation_level`, baseline layers, same-id 400)                                                                                                                                                                                                                                                                                  |

**Infrastructure:** `conftest.py` adds `backend/` to `sys.path`. Auth bypassed via `app.dependency_overrides[get_current_user]`. All DB/ML/storage calls patched on module-local symbols (not source modules). `_persist_analysis` is also patched to skip DB writes.

---

## Known Limitations & Outstanding Issues

| Item                                 | Detail                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report_service.py` is a stub        | Returns hardcoded summary. No PDF/email/structured format.                                                                                                                |
| `_analysis_jobs` is in-process only  | Job status lost on server restart. A production system would persist job state to DB. In a multi-worker uvicorn deployment, status is not shared across worker processes. |
| `per_angle[].summary` is hardcoded   | Not an LLM-generated summary.                                                                                                                                             |
| `session-thumbnails` endpoint unused | Implemented, not called by any frontend page.                                                                                                                             |
| `GET /sessions/{id}/analysis` unused | Implemented, not called by any frontend page.                                                                                                                             |
| `embedding_vector` column unused     | HNSW index exists but backend uses JSON text `embedding` column for all reads/writes.                                                                                     |

---

## Scripts

### `scripts/dataset_export.py` — Phase 7B Dataset Collection

Exports all captured images and associated metadata to a local directory for use in future model training or analysis.

**Usage:**

```powershell
cd backend
# export everything
python scripts/dataset_export.py --out-dir dataset

# export a single user
python scripts/dataset_export.py --out-dir dataset --user-filter <user_uuid>
```

**Requires:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars (auto-loaded from `backend/.env` if present).

**Output structure:**

```
dataset/
    manifest.csv                          ← all rows in flat CSV
    <user_id>/
        <session_id>/
            front.jpg                     ← downloaded images, one per angle
            left.jpg
            ...
            metadata.json                 ← session + angle metadata
```

**`manifest.csv` columns:** `user_id`, `session_id`, `angle_type`, `image_path` (relative), `storage_path`, `timestamp`, `quality_score`, `embedding` (JSON string).

**Progress target:** 20 users × 10 sessions × 6 angles = 1200 images. The script prints progress toward this target after export.

**Install extra dep (not in `requirements.txt`):**

```powershell
pip install python-dotenv
```

---

## Suggested Future Improvements

| Improvement            | What                                              | Why                                                                        | Effort           |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| Background removal     | MediaPipe SelfieSegmentation or `rembg`           | Strips background before embedding — single largest remaining noise source | Medium (new dep) |
| Colour-cast correction | Grey-world or white-patch white balance           | Corrects indoor lighting colour casts                                      | Low (~10 lines)  |
| ONNX export            | Export EfficientNetV2-S to ONNX for `onnxruntime` | ~2–3× faster on CPU; no PyTorch needed at runtime; smaller container       | Low              |
| Tilt correction        | Hough-line deskew on edge map                     | More consistent framing across sessions                                    | Medium           |
| Pose estimation        | MediaPipe full-body keypoints                     | Precise torso crop; solves tilt; more robust than contour detection        | High (new dep)   |
| DB job state           | Persist async status to `analysis_logs`           | Works across restarts and multi-worker deployments                         | Low              |

---

## Dependencies (`requirements.txt`)

| Package                  | Version  | Purpose                                                                                        |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `fastapi`                | 0.110.0  | Web framework                                                                                  |
| `uvicorn`                | 0.27.1   | ASGI server                                                                                    |
| `python-dotenv`          | 1.0.1    | Load `.env`                                                                                    |
| `supabase`               | 2.10.0   | Supabase Python client (DB + Storage)                                                          |
| `python-jose`            | 3.3.0    | JWT decode + JWKS key construction                                                             |
| `cryptography`           | 41.0.7   | Required by python-jose for EC (ES256) key support                                             |
| `requests`               | 2.32.3   | HTTP client for JWKS fetch                                                                     |
| `pytest`                 | 7.4.0    | Test runner                                                                                    |
| `httpx`                  | 0.27.0   | Async HTTP client (required by FastAPI `TestClient`)                                           |
| `torch`                  | 2.1.0    | PyTorch — EfficientNetV2-S inference (CPU-only build in Docker)                                |
| `torchvision`            | 0.16.0   | EfficientNetV2-S model + ImageNet transforms                                                   |
| `opencv-python-headless` | 4.8.1.78 | NLMeans denoise, CLAHE, contour crop, resize, sharpen (`-headless` = no GUI deps, Docker-safe) |
| `pillow`                 | 10.1.0   | Image loading from bytes, EXIF transpose                                                       |
| `numpy`                  | 1.24.3   | All numerical operations on embeddings and quality scores                                      |
| `slowapi`                | 0.1.9    | Rate limiting middleware for FastAPI                                                           |

**Install:**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

> `torch` and `torchvision` are ~1–2 GB. In Docker, CPU-only wheels from `https://download.pytorch.org/whl/cpu` are used to avoid the full GPU package.

---

## Data Flow — Full Session Analysis (Phase 6 current state)

```
Browser (Result.tsx)
  │
  ├─ GET /api/session-info/{id}
  │    └─ sessions table (4 queries: verify, count, oldest, 2 most-recent)
  │    └─ returns: is_first_session, previous_session_id, total_sessions
  │
  ├─ GET /api/image-preview/{id}/{type}  x6 in parallel
  │    └─ images table + supabase.storage.create_signed_url() → 1hr signed URLs
  │
  ├─ POST /api/analyze-session/{id}     (?force=true bypasses cache)
  │    └─ analyze_session.py
  │         ├─ Rate limit check (20/day per IP)
  │         ├─ session_service: verify ownership + status == "completed"
  │         ├─ image_service: fetch image records, require >= 3 angle types
  │         │
  │         ├─ [CACHE CHECK] fetch_cached_analysis()
  │         │    └─ If session_analysis rows exist AND ?force != "true"
  │         │         → return immediately with from_cache: true (no ML run)
  │         │
  │         └─ [ML PIPELINE] analysis_service.analyze_session()
  │              ├─ _load_user_baseline()        → session_embeddings (all prior) → mean vector
  │              ├─ _load_per_angle_baselines()  → angle_embeddings (per angle_type) → {"front": vec, ...}
  │              ├─ _load_trend_score()          → session_analysis (last 5 scores) → moving average
  │              │
  │              ├─ Group images by angle_type
  │              │
  │              ├─ ThreadPoolExecutor (max_workers = min(n_angles, 6))
  │              │    └─ Per-angle worker thread:
  │              │         ├─ For each image in angle group:
  │              │         │    ├─ preprocessing.preprocess_pipeline()
  │              │         │    │    ├─ storage.download(path)
  │              │         │    │    ├─ ImageOps.exif_transpose()        ← EXIF orientation
  │              │         │    │    ├─ fast_downscale(max=640px)         ← 4K → 640px before NLMeans
  │              │         │    │    ├─ denoise_image()                   ← NLMeans (h=6)
  │              │         │    │    ├─ apply_clahe()                     ← LAB CLAHE clipLimit=2.0
  │              │         │    │    ├─ detect_torso_crop()               ← adaptive threshold → contour crop
  │              │         │    │    ├─ resize_intermediate(384x384)      ← Lanczos4
  │              │         │    │    ├─ center_crop_final(224x224)        ← centre crop
  │              │         │    │    ├─ sharpen_image()                   ← unsharp mask 1.8/-0.8
  │              │         │    │    └─ compute_image_quality()           ← blur + brightness on final image
  │              │         │    └─ embedding.extract_embedding()
  │              │         │         └─ EfficientNetV2-S → 1280-dim float32
  │              │         │              (user_mean subtraction: DISABLED — was causing identical images ~1.0)
  │              │         │
  │              │         ├─ angle_embedding = mean(image_embeddings_for_this_angle)
  │              │         ├─ angle_baseline = per_angle_baselines[angle_type] ?? user_baseline
  │              │         └─ change_score = cosine_distance(angle_embedding, angle_baseline)
  │              │              ← KEY: front compared to prior fronts, not to blended session mean
  │              │
  │              ├─ session_embedding = mean(angle_embeddings)
  │              ├─ _store_angle_embeddings() → angle_embeddings table (delete-then-insert)
  │              ├─ _store_session_embedding() → session_embeddings table (delete-then-insert)
  │              ├─ overall_change_score = cosine_distance(session_embedding, user_baseline)
              ├─ angle_aware_score = mean(per_angle_change_scores)   ← Phase 7: angle-assignment-sensitive
              ├─ compute_session_quality()
              ├─ compute_consistency_score()
              ├─ compute_analysis_confidence()
              └─ analysis_logs write: {session_id, user_id, processing_time_ms, confidence_score}  ← Phase 7
  │
  │         └─ _persist_analysis()
  │              ├─ angle_analysis (delete-then-insert, graceful fallback if angle_quality_score col missing)
  │              └─ session_analysis (delete-then-insert, 4-level fallback: Phase7 → Phase5 → Phase4 → bare minimum)
  │
  └─ POST /api/compare-sessions/{id}/{prev_id}   (skipped if is_first_session)
       └─ comparison_service.compare_sessions()
            ├─ _load_angle_scores() x2        → angle_analysis table
            ├─ _load_session_embedding() x2   → session_embeddings table
            ├─ _load_angle_embeddings() x2    → angle_embeddings table
            ├─ Layer 1 (immediate):  cosine_distance(current_emb, previous_emb)
            ├─ Layer 2 (rolling):   current_emb vs mean of last 5 prior session_embeddings
            ├─ Layer 3 (monthly):   current_emb vs mean of last-30-day session_embeddings
            ├─ Layer 4 (lifetime):  current_emb vs mean of ALL prior session_embeddings
            └─ Layer 5 (per-angle): cosine_distance per angle + score delta from angle_analysis
                                    variation_level per angle
```
