# BCD Backend — Complete Documentation

**Framework:** FastAPI (Python)  
**Runtime:** Uvicorn ASGI  
**Database:** Supabase (PostgreSQL via Supabase Python SDK)  
**Storage:** Supabase Storage (`bcd-images` bucket)  
**Auth:** Supabase JWTs (ES256 algorithm, JWKS verification)  
**ML:** PyTorch EfficientNetV2-S (1280-dim embeddings), OpenCV (CLAHE, contour crop, denoise, sharpen)  
**Rate Limiting:** slowapi 0.1.9 (20 analyses/day per IP, configurable)  
**Base URL:** `http://localhost:8000` (dev) | prefix all routes with `/api`  
**Interactive Docs:** `http://localhost:8000/api/docs`

---

## Directory Structure

```
backend/
├── .env                          # Secret env vars — NOT in git
├── requirements.txt              # All Python dependencies
├── PHASE3_MIGRATION.sql          # DB migration: session_embeddings table
├── PHASE4_MIGRATION.sql          # DB migration: angle_embeddings + session_analysis columns
├── PHASE5_MIGRATION.sql          # DB migration: pgvector vector(2048) columns, quality score, analysis_logs
├── PHASE6_MIGRATION.sql          # DB migration: vector(2048)→vector(1280) model upgrade, clear old embeddings
│
├── app/
│   ├── main.py                   # FastAPI app entrypoint — logging, CORS, rate limiting, routers
│   ├── config.py                 # Settings loader (reads .env via python-dotenv)
│   ├── dependencies.py           # FastAPI dependencies: get_current_user
│   ├── limiter.py                # Shared slowapi Limiter singleton (avoids circular imports)
│   │
│   ├── api/                      # HTTP route handlers (thin controllers)
│   │   ├── analyze_session.py    # POST /api/analyze-session/{session_id}
│   │   ├── analyze_status.py     # GET  /api/analyze-status/{session_id}   ← NEW Phase 5
│   │   ├── compare_sessions.py   # POST /api/compare-sessions/{current}/{previous}
│   │   ├── session_analysis.py   # GET  /api/sessions/{session_id}/analysis
│   │   ├── generate_report.py    # POST /api/generate-report/{session_id}
│   │   └── utility.py            # GET  /api/image-preview, /session-info, /session-thumbnails
│   │
│   ├── services/                 # Business logic and DB access
│   │   ├── db.py                 # Supabase client factory
│   │   ├── session_service.py    # get_session() helper
│   │   ├── image_service.py      # get_session_images() helper
│   │   ├── analysis_service.py   # Full ML analysis: preprocess → orient → embed → score → store
│   │   ├── comparison_service.py # Compare two sessions via embeddings
│   │   ├── analysis_fetch_service.py # Read stored analysis back from DB
│   │   └── report_service.py     # Build report from stored analysis (stub)
│   │
│   ├── processing/               # Low-level ML / CV operations
│   │   ├── preprocessing.py      # Phase 6: load+EXIF → denoise → CLAHE → torso crop → resize384 → crop224 → sharpen → quality
│   │   ├── quality.py            # Image quality scoring — blur, brightness, confidence  ← Phase 5
│   │   └── embedding.py          # EfficientNetV2-S (1280-dim) singleton; loads finetuned weights if present
│   │
│   └── utils/
│       └── security.py           # JWT decode + JWKS fetch with 1hr in-memory cache
│
├── tests/
│   ├── conftest.py               # sys.path setup for 'app.*' imports
│   ├── test_quality.py           # 55 unit tests — quality.py + Phase 6 preprocessing steps
│   └── test_api.py               # 13 integration tests — all external calls mocked
│
└── tools/
    ├── preview_preprocessing.py  # Dev-only: run Phase 6 pipeline on a local file, save step-by-step output images
    └── finetune_efficientnet.py  # Offline training script — fine-tune EfficientNetV2-S on BreastMNIST/CBIS-DDSM
```

**Deleted in Phase 5:**

- `app/processing/session_analysis.py` — was dead stub, removed
- `app/processing/trend_analysis.py` — was dead stub, removed

---

## Environment Variables (`.env`)

> `.env` is gitignored. Never commit it. A new developer must create it manually.

| Variable                      | Value                                      | Purpose                                                     |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `SUPABASE_URL`                | `https://vtpgeaqhkbbpvaigxwgq.supabase.co` | Supabase project URL                                        |
| `SUPABASE_SERVICE_ROLE_KEY`   | `eyJhbG...` (JWT)                          | Bypasses RLS — used by backend only, never sent to frontend |
| `JWT_ALGORITHM`               | `ES256`                                    | Supabase uses ES256 (Elliptic Curve), **not** RS256         |
| `API_HOST`                    | `0.0.0.0`                                  | Bind address for uvicorn                                    |
| `API_PORT`                    | `8000`                                     | Port                                                        |
| `API_PREFIX`                  | `/api`                                     | All routes prefixed here                                    |
| `ALLOWED_ORIGINS`             | `*` (dev) or `https://yourapp.com` (prod)  | **NEW Phase 5** — CORS origins; comma-separated list or `*` |
| `RATE_LIMIT_ANALYSIS_PER_DAY` | `20`                                       | **NEW Phase 5** — Max analyze-session calls per day per IP  |

**Not set but auto-derived:** `SUPABASE_JWKS_URL` — if absent, `config.py` builds it as `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`.

**Not used but declared:** `SUPABASE_JWT_PUBLIC_KEY` — was the old RS256 approach; kept in `Settings` but ignored.

---

## How to Run

```powershell
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Server starts at `http://localhost:8000`. The `--reload` flag auto-restarts on file changes.

---

## Authentication Flow

Every endpoint (except `GET /`) requires a valid Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <supabase-access-token>
```

The flow:

1. Frontend calls `supabase.auth.getSession()` to get the access token
2. Frontend sends it as a Bearer token
3. Backend `get_current_user()` dependency extracts it
4. `security.py` fetches JWKS from Supabase (cached for 1 hour), finds the matching key by `kid`, and verifies the JWT signature
5. If valid, returns `{"user_id": str, "role": str, "email": str}` which all handlers receive as the `user` parameter
6. If invalid or missing → `401 Unauthorized`

**Key detail:** `verify_aud: False` is set because Supabase JWTs have `aud: "authenticated"` but python-jose's audience check requires explicit opt-in. Disabling it is safe because the signature is still fully verified.

---

## API Endpoints

### `GET /`

**File:** `app/main.py` | **Auth:** None  
Health check — returns `{"status": "ok"}`

---

### `POST /api/analyze-session/{session_id}`

**File:** `app/api/analyze_session.py` | **Auth:** Required  
**Rate limit:** 20 requests/day per IP (configurable via `RATE_LIMIT_ANALYSIS_PER_DAY`)  
**Query param:** `?async_process=false` (optional)

**What it does (sync mode):**

1. Validates session exists and belongs to the authenticated user
2. Checks session `status == "completed"`
3. Fetches image records via `get_session_images()`
4. Requires **at least 3 angles** (fails 400 if fewer)
5. Calls `analysis_service.analyze_session()` — full ML + quality pipeline
6. Persists results to `angle_analysis` and `session_analysis` tables (idempotent)
7. Returns analysis JSON including Phase 5 trust/quality fields

**Async mode** (`?async_process=true`): Registers the job in `_analysis_jobs` dict, enqueues as a FastAPI `BackgroundTask`, returns `{"status": "processing"}` immediately. Poll `GET /api/analyze-status/{session_id}` for completion.

**Response (sync):**

```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "overwritten": false,
    "is_first_session": false,
    "session_analysis": {
      "per_angle": [
        {
          "angle_type": "front",
          "change_score": 0.42,
          "variation_level": "Moderate Variation",
          "angle_quality_score": 0.78,
          "summary": "Distance-based analysis for front angle."
        }
      ],
      "overall_summary": "ML analysis complete."
    },
    "scores": {
      "overall_change_score": 0.42,
      "variation_level": "Moderate Variation",
      "trend_score": 0.38,
      "is_first_session": false,
      "analysis_confidence_score": 0.82,
      "session_quality_score": 0.77
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
    "comparison_layers_used": ["immediate", "rolling", "monthly", "lifetime"],
    "processing_time_ms": 2500
  }
}
```

---

### `GET /api/analyze-status/{session_id}` ← NEW Phase 5

**File:** `app/api/analyze_status.py` | **Auth:** Required

Polls the status of an async analysis job. Checks the in-memory `_analysis_jobs` registry first, then falls back to querying the `session_analysis` DB table.

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "processing", // "processing" | "completed" | "failed" | "not_started"
    "error": null // string on failure, null otherwise
  }
}
```

**Status values:**

- `not_started` — no job found in registry and no DB row
- `processing` — job is running
- `completed` — job finished successfully (DB row confirms)
- `failed` — job threw an exception; `error` contains the message

---

### `POST /api/compare-sessions/{current_session_id}/{previous_session_id}`

**File:** `app/api/compare_sessions.py` | **Auth:** Required

**What it does:**
Compares two sessions using stored embeddings and per-angle scores across 4 baseline layers.

**Response (Phase 5 additions highlighted):**

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

---

### `GET /api/session-info/{session_id}`

**File:** `app/api/utility.py` | **Auth:** Required

Returns session metadata: is it the first? what is the previous session id? how many total?

**Response:**

```json
{
  "session_id": "uuid",
  "is_first_session": true,
  "is_current": true,
  "total_sessions": 1,
  "created_at": "2026-02-16T10:00:00",
  "previous_session_id": null
}
```

---

### `GET /api/image-preview/{session_id}/{image_type}`

**File:** `app/api/utility.py` | **Auth:** Required

Generates a 1-hour signed URL for a single image (uses the service role key server-side).

`image_type` values: `front`, `left`, `right`, `up`, `down`, `raised`

---

### `GET /api/session-thumbnails/{session_id}`

**File:** `app/api/utility.py` | **Auth:** Required

Batch version of image-preview — returns signed URLs for all 6 angles in one request. Implemented and working but **not currently called by any frontend page**.

---

### `GET /api/sessions/{session_id}/analysis`

**File:** `app/api/session_analysis.py` | **Auth:** Required

Read back already-stored analysis results without re-running ML. Returns 404 if never analyzed. **Not currently called anywhere in the frontend.**

---

### `POST /api/generate-report/{session_id}`

**File:** `app/api/generate_report.py` | **Auth:** Required  
**⚠️ STUB.** Returns a hardcoded summary string. No PDF, no email, not yet implemented.

---

## Processing Layer

### `processing/quality.py` ← NEW Phase 5

Pure quality-scoring module. No ML model involved — all OpenCV.

**`ImageQuality` dataclass:**

| Field           | Type    | Description                                                     |
| --------------- | ------- | --------------------------------------------------------------- |
| `blur_score`    | `float` | Laplacian variance of the image (higher = sharper)              |
| `brightness`    | `float` | Mean pixel value in [0, 1]                                      |
| `is_blurry`     | `bool`  | `True` if `blur_score < 80.0`                                   |
| `is_too_dark`   | `bool`  | `True` if `brightness < 0.15`                                   |
| `is_too_bright` | `bool`  | `True` if `brightness > 0.90`                                   |
| `quality_score` | `float` | Composite [0, 1]: 60% blur component + 40% brightness component |

**Key functions:**

| Function                                                                | Description                                                          |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `compute_image_quality(image)`                                          | Per-image quality from a float32 [0,1] image                         |
| `compute_session_quality(angle_quality_scores)`                         | Mean of per-angle scores × coverage factor (÷6 angles)               |
| `compute_consistency_score(angle_change_scores)`                        | `1 - std/0.5` — how consistent change scores are across angles       |
| `compute_analysis_confidence(quality, consistency, n_angles, is_first)` | Weighted: 40% quality + 30% consistency + 20% coverage + 10% history |
| `variation_level(score)`                                                | Maps cosine distance to a neutral label (see table below)            |

**`variation_level` mapping — deliberately non-medical language:**

| Score range | Label              |
| ----------- | ------------------ |
| 0.00 – 0.10 | Stable             |
| 0.10 – 0.25 | Mild Variation     |
| 0.25 – 0.45 | Moderate Variation |
| 0.45 – 0.70 | Higher Variation   |
| 0.70 – 1.00 | Strong Variation   |

---

### `processing/preprocessing.py` (Phase 6 rewrite)

Full image preprocessing pipeline. Returns a `PreprocessResult` dataclass.

**`PreprocessResult` dataclass:**

```python
@dataclass
class PreprocessResult:
    image: np.ndarray    # float32 [0,1], 224×224 RGB
    quality: ImageQuality
```

**Pipeline steps (Phase 6):**

| Step | Function                  | What it does                                                                                                          |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1    | `load_image_from_storage` | Downloads from Supabase Storage, applies `ImageOps.exif_transpose()` (EXIF-only orientation), returns uint8 RGB      |
| 2    | `denoise_image`           | `cv2.fastNlMeansDenoisingColored` — removes sensor noise (h=6, hColor=6)                                             |
| 3    | `apply_clahe`             | Converts to LAB, runs CLAHE (clipLimit=2.0, 8×8 tile) on L channel, converts back → float32 [0,1]                   |
| 4    | `detect_torso_crop`       | Adaptive threshold → contours → largest central contour → crop + 5% padding; fallback to full image if none found    |
| 5    | `resize_intermediate`     | INTER_LANCZOS4 resize to 384×384                                                                                      |
| 6    | `center_crop_final`       | Centre-crop to 224×224                                                                                                |
| 7    | `sharpen_image`           | Unsharp mask (1.8/−0.8 weights, σ=1.5) — restores edge detail lost in resizing                                       |
| 8    | `compute_image_quality`   | Quality metrics on the final 224×224 image (reflects exactly what the embedding model sees)                          |

**Orientation:** EXIF-only (`ImageOps.exif_transpose` in step 1). The guided capture flow guarantees the user holds the phone correctly; EXIF handles the tag-level cases. The previous silhouette-based `auto_orient_image` was removed in Phase 6 as it added noise rather than fixing anything for this image type.

---

### `processing/embedding.py` (Phase 6 upgrade)

EfficientNetV2-S feature extractor.

| Thing              | Detail                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Model              | `torchvision.models.efficientnet_v2_s(weights=EfficientNet_V2_S_Weights.DEFAULT)` with classifier set to Identity |
| Output             | **1280-dimensional** float32 vector (was 2048 with ResNet50)                                                   |
| Device             | CUDA if available, else CPU                                                                                     |
| Singleton          | `get_encoder()` loads the model once; first request takes ~2–4s                                                |
| Normalisation      | ImageNet mean/std via `transforms.Normalize`                                                                    |
| User normalisation | If `user_mean` provided: `embedding = embedding - user_mean`                                                   |
| Fine-tuned weights | Loads `models/efficientnet_v2_s_finetuned.pth` automatically if present (produced by `tools/finetune_efficientnet.py`) |
| Constant           | `EMBEDDING_DIM = 1280`                                                                                         |

---

## Services Layer

### `services/analysis_service.py` (Phase 5 rewrite)

**`analyze_session(images, user_id, session_id) → dict`**

Now integrates the full quality pipeline:

1. For each image: `preprocess_pipeline()` → `PreprocessResult` → `result.image` for embedding, `result.quality` for quality metrics
2. Per-angle: `angle_quality_score`, `image_quality` list, `variation_level` label
3. Session aggregation: `compute_session_quality()`, `compute_consistency_score()`, `compute_analysis_confidence()`
4. Return dict now includes: `variation_level`, `analysis_confidence_score`, `session_quality_score`, `image_quality_summary`, `baseline_used`, `comparison_layers_used`, `processing_time_ms`
5. Structured logging for each completed analysis

### `services/comparison_service.py` (Phase 5 updates)

Now returns per-angle `variation_level` labels, `overall_variation_level`, `baseline_used`, `comparison_layers_used`, `processing_time_ms`. All baseline layers now include a `variation_level` field.

---

## `app/limiter.py` ← NEW Phase 5

Shared slowapi `Limiter` singleton. Exists to prevent circular imports between `main.py` (which registers the exception handler) and `analyze_session.py` (which applies the `@limiter.limit()` decorator). Falls back to a no-op `_NoOpLimiter` if slowapi is not installed.

---

## Database

### Tables Used

| Table                | Used by                                                           | Purpose                                                      |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `sessions`           | `session_service`, `utility.py`                                   | Session records with `status` field                          |
| `images`             | `image_service`, `utility.py`                                     | Per-angle image records with `storage_path`                  |
| `session_analysis`   | `analyze_session`, `analysis_fetch_service`                       | One row per session: scores, baselines                       |
| `angle_analysis`     | `analyze_session`, `analysis_fetch_service`, `comparison_service` | One row per angle per session                                |
| `session_embeddings` | `analysis_service`, `comparison_service`                          | **1280-dim** EfficientNetV2-S session embedding (Phase 6 migration clears old 2048-dim data) |
| `angle_embeddings`   | `analysis_service`, `comparison_service`                          | **1280-dim** EfficientNetV2-S per-angle embedding (Phase 6 migration clears old 2048-dim data) |
| `analysis_logs`      | (future)                                                          | Per-request processing log — created by PHASE5_MIGRATION.sql |

### Phase 5 DB Changes (`PHASE5_MIGRATION.sql`)

Run this in the Supabase SQL Editor when ready:

```sql
-- pgvector extension (for future native vector storage)
CREATE EXTENSION IF NOT EXISTS vector;

-- New columns on session_analysis
ALTER TABLE session_analysis
  ADD COLUMN IF NOT EXISTS analysis_confidence_score float,
  ADD COLUMN IF NOT EXISTS session_quality_score float;

-- New column on angle_analysis
ALTER TABLE angle_analysis
  ADD COLUMN IF NOT EXISTS angle_quality_score float;

-- analysis_logs table (RLS blocks public access)
CREATE TABLE IF NOT EXISTS analysis_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid,
  user_id uuid,
  processing_time_ms int,
  status text,
  error_message text,
  created_at timestamptz DEFAULT now()
);
```

The code uses a 3-level graceful fallback — it attempts to store the new columns, catches errors if the migration hasn't been run yet, and falls back to the basic insert. **No production breakage** if migration is delayed.

---

## Security & Production Concerns

### CORS (Phase 5)

`main.py` reads `ALLOWED_ORIGINS` from env and splits comma-separated values:

```python
# In production
ALLOWED_ORIGINS="https://yourapp.com,https://staging.yourapp.com"

# In dev (default)
ALLOWED_ORIGINS="*"
```

When `"*"`, `allow_credentials=False` is automatically set (wildcard + credentials violates the CORS spec).

### Rate Limiting (Phase 5)

`POST /api/analyze-session/{session_id}` is decorated with `@limiter.limit("20/day")` (or whatever `RATE_LIMIT_ANALYSIS_PER_DAY` is set to). The ML pipeline takes 2–4 seconds per call and is the most expensive endpoint. Rate limited by remote IP via slowapi.

### Structured Logging (Phase 5)

`logging.config.dictConfig` is called at startup. All `app.*` logger calls produce timestamped JSON-friendly lines. `uvicorn.access` logs are suppressed to reduce noise. Key events logged:

- `analyze_session complete | session=... processing_time_ms=...`
- `compare_sessions complete | ...`
- All unhandled exceptions via `logger.exception()`

---

## Tests

**Run:**

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/ -v
```

**Current result: 55/55 passing.**

| File              | Tests    | What's covered                                                                                                                                                                                                                                                        |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test_quality.py` | 42 tests | `variation_level` (15 parametrised cases + no-medical-language check), `compute_image_quality`, `compute_session_quality`, `compute_consistency_score`, `compute_analysis_confidence`, `PreprocessResult`, preprocessing steps (normalize/align/resize/full pipeline) |
| `test_api.py`     | 13 tests | Health check, `analyze-session` (200, required fields, variation_level, image_quality_summary), `analyze-status` (all 4 status values), `compare-sessions` (200, trust fields, per-angle variation_level, baseline layers, same-id 400)                               |

Auth is mocked via `app.dependency_overrides[get_current_user]`. All DB/ML/storage calls are monkeypatched on the module-level names (not the service module) to match Python import semantics.

---

## Current Issues

*(Phase 6: the silhouette / `auto_orient_image` issue documented here has been resolved by removing that approach entirely. Orientation is now EXIF-only, which is sufficient because the guided capture flow ensures correct phone orientation and EXIF handles the tag-level cases. No current critical issues remain.)*

---

## Suggested Future Improvements

| Improvement                      | What                                                                                              | Why it helps                                                 | Effort                |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------- |
| **Background removal**           | Segmentation model (e.g. MediaPipe SelfieSegmentation or rembg)                                  | Eliminates background clutter from embeddings                | Medium — new dep      |
| **Colour-cast correction**       | Grey-world or white-patch white-balance                                                           | Fixes yellow/blue casts from indoor artificial lighting       | Low — 10 lines        |
| **Fine-tuning (run offline)**    | Run `tools/finetune_efficientnet.py` on BreastMNIST/CBIS-DDSM; deploy `efficientnet_v2_s_finetuned.pth` | Improves embedding relevance for breast tissue images        | Medium — offline only |
| **ONNX export**                  | Export EfficientNetV2-S to ONNX for faster CPU inference                                          | ~2–3× faster on CPU                                          | Low                   |
| **Tilt correction**              | Detect + deskew small angular offsets via Hough lines on vertical edges                           | Improves embedding consistency                               | Medium                |
| **Pose estimation (MediaPipe)**  | Full body keypoint detection — shoulders, hips                                                    | Would improve crop precision; currently not needed            | High — new dep        |

---

## Dependencies (`requirements.txt`)

| Package         | Version  | Purpose                                                          |
| --------------- | -------- | ---------------------------------------------------------------- |
| `fastapi`       | 0.110.0  | Web framework                                                    |
| `uvicorn`       | 0.27.1   | ASGI server                                                      |
| `python-dotenv` | 1.0.1    | Load `.env`                                                      |
| `supabase`      | 2.10.0   | Supabase Python client (DB + Storage)                            |
| `python-jose`   | 3.3.0    | JWT decode and JWKS key construction                             |
| `cryptography`  | 41.0.7   | Required by python-jose for EC key support                       |
| `requests`      | 2.32.3   | HTTP client for JWKS fetch                                       |
| `pytest`        | 7.4.0    | Test runner                                                      |
| `httpx`         | 0.27.0   | Async HTTP client (used by FastAPI TestClient)                   |
| `torch`         | 2.1.0    | PyTorch — ResNet50 inference                                     |
| `torchvision`   | 0.16.0   | ResNet50 model + ImageNet transforms                             |
| `opencv-python` | 4.8.1.78 | Preprocessing — CLAHE, denoise, contour crop, resize, sharpen |
| `pillow`        | 10.1.0   | Image loading from bytes, EXIF transpose                         |
| `numpy`         | 1.24.3   | All numerical operations on embeddings and quality scores        |
| `slowapi`       | 0.1.9    | **NEW Phase 5** — Rate limiting middleware for FastAPI           |

---

## Data Flow — Full Session Analysis (Phase 5)

```
Browser (Result.tsx)
  │
  ├─ GET /api/session-info/{id}
  │    └─ sessions table (4 queries) → is_first_session, previous_session_id
  │
  ├─ GET /api/image-preview/{id}/{type}  ×6 parallel
  │    └─ images table + storage.create_signed_url() → 1hr signed URLs
  │
  ├─ POST /api/analyze-session/{id}
  │    └─ analyze_session.py
  │         ├─ Rate limit check (20/day per IP)
  │         ├─ session_service: verify ownership + completed status
  │         ├─ image_service: fetch image records (need ≥3 angles)
  │         └─ analysis_service.analyze_session()
  │              ├─ load_user_baseline()  — session_embeddings table
  │              ├─ load_trend_score()    — session_analysis table
  │              ├─ Group images by angle_type
  │              ├─ For each angle group:
  │              │    └─ For each image:
  │              │         ├─ preprocessing.preprocess_pipeline()     ← Phase 6
  │              │         │    ├─ storage.download(path)
  │              │         │    ├─ ImageOps.exif_transpose()          ← EXIF orientation
  │              │         │    ├─ denoise_image()                    ← NLMeans
  │              │         │    ├─ apply_clahe()                      ← LAB CLAHE → float32
  │              │         │    ├─ detect_torso_crop()                ← contour crop
  │              │         │    ├─ resize_intermediate()              ← 384×384
  │              │         │    ├─ center_crop_final()                ← 224×224
  │              │         │    ├─ sharpen_image()                    ← unsharp mask
  │              │         │    └─ compute_image_quality()            ← blur + brightness
  │              │         └─ embedding.extract_embedding()           ← EfficientNetV2-S → 1280-dim
  │              │    └─ angle_embedding = mean(image_embeddings)
  │              │    └─ angle_quality_score, variation_level
  │              ├─ session_embedding = mean(angle_embeddings)
  │              ├─ compute_session_quality()
  │              ├─ compute_consistency_score()
  │              ├─ compute_analysis_confidence()
  │              ├─ store angle_embeddings → angle_embeddings table
  │              ├─ store session_embedding → session_embeddings table
  │              └─ persist → angle_analysis (with angle_quality_score)
  │                        → session_analysis (with analysis_confidence_score,
  │                                            session_quality_score)
  │              └─ returns: per_angle, scores, image_quality_summary,
  │                          variation_level, analysis_confidence_score,
  │                          baseline_used, comparison_layers_used,
  │                          processing_time_ms
  │
  └─ POST /api/compare-sessions/{id}/{prev_id}   (only if not first session)
       └─ comparison_service.compare_sessions()
            ├─ load angle_analysis for both sessions
            ├─ load session_embeddings for both sessions
            ├─ load angle_embeddings for both sessions
            ├─ Layer 1 (immediate):  cosine distance between session embeddings
            ├─ Layer 2 (rolling):    current vs mean of last 5 prior sessions
            ├─ Layer 3 (monthly):    current vs mean of sessions in last 30 days
            ├─ Layer 4 (lifetime):   current vs mean of ALL prior sessions
            ├─ Layer 5 (per-angle):  per-angle embedding distances + score deltas
            │                         + variation_level per angle
            └─ returns: per_angle, overall_delta, overall_variation_level,
                        rolling/monthly/lifetime baselines (each with variation_level),
                        baseline_used, comparison_layers_used, processing_time_ms
```

**Framework:** FastAPI (Python)  
**Runtime:** Uvicorn ASGI  
**Database:** Supabase (PostgreSQL via Supabase Python SDK)  
**Storage:** Supabase Storage (`bcd-images` bucket)  
**Auth:** Supabase JWTs (ES256 algorithm, JWKS verification)  
**ML:** PyTorch ResNet50 (embedding extraction), OpenCV (preprocessing)  
**Base URL:** `http://localhost:8000` (dev) | prefix all routes with `/api`  
**Interactive Docs:** `http://localhost:8000/api/docs`

---

## Directory Structure

```
backend/
├── .env                          # Secret env vars — NOT in git
├── requirements.txt              # All Python dependencies
├── PHASE3_MIGRATION.sql          # DB migration for session_embeddings table
├── PHASE4_MIGRATION.sql          # DB migration for angle_embeddings + session_analysis columns
│
├── app/
│   ├── main.py                   # FastAPI app entrypoint, CORS, router registration, global exception handler
│   ├── config.py                 # Settings loader (reads .env via python-dotenv)
│   ├── dependencies.py           # FastAPI dependencies: get_current_user
│   │
│   ├── api/                      # HTTP route handlers (thin controllers)
│   │   ├── analyze_session.py    # POST /api/analyze-session/{session_id}
│   │   ├── compare_sessions.py   # POST /api/compare-sessions/{current}/{previous}
│   │   ├── session_analysis.py   # GET  /api/sessions/{session_id}/analysis
│   │   ├── generate_report.py    # POST /api/generate-report/{session_id}
│   │   └── utility.py            # GET  /api/image-preview, /session-info, /session-thumbnails
│   │
│   ├── services/                 # Business logic and DB access
│   │   ├── db.py                 # Supabase client factory
│   │   ├── session_service.py    # get_session() helper
│   │   ├── image_service.py      # get_session_images() helper
│   │   ├── analysis_service.py   # Full ML analysis: preprocess → embed → score → store
│   │   ├── comparison_service.py # Compare two sessions via embeddings
│   │   ├── analysis_fetch_service.py # Read stored analysis back from DB
│   │   └── report_service.py     # Build report from stored analysis (stub)
│   │
│   ├── processing/               # Low-level ML / CV operations
│   │   ├── preprocessing.py      # Image load from storage, normalize, align, resize
│   │   ├── embedding.py          # ResNet50 model singleton, feature extraction
│   │   ├── session_analysis.py   # compute_session_scores() — NOT currently used (stub)
│   │   └── trend_analysis.py     # compute_trend() — NOT currently used (stub)
│   │
│   └── utils/
│       └── security.py           # JWT decode + JWKS fetch with 1hr in-memory cache
│
└── tests/
    └── test_api.py               # pytest unit tests with monkeypatching
```

---

## Environment Variables (`.env`)

> `.env` is gitignored. Never commit it. A new developer must create it manually.

| Variable                    | Value                                      | Purpose                                                     |
| --------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `SUPABASE_URL`              | `https://vtpgeaqhkbbpvaigxwgq.supabase.co` | Supabase project URL                                        |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` (JWT)                          | Bypasses RLS — used by backend only, never sent to frontend |
| `JWT_ALGORITHM`             | `ES256`                                    | Supabase uses ES256 (Elliptic Curve), **not** RS256         |
| `API_HOST`                  | `0.0.0.0`                                  | Bind address for uvicorn                                    |
| `API_PORT`                  | `8000`                                     | Port                                                        |
| `API_PREFIX`                | `/api`                                     | All routes prefixed here                                    |

**Not set but auto-derived:** `SUPABASE_JWKS_URL` — if absent, `config.py` builds it as `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`.

**Not used but declared:** `SUPABASE_JWT_PUBLIC_KEY` — was the old RS256 approach; kept in `Settings` dataclass but ignored since the switch to JWKS.

---

## How to Run

```powershell
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Or if `uvicorn` is on PATH:

```powershell
uvicorn app.main:app --reload
```

Server starts at `http://localhost:8000`. The `--reload` flag auto-restarts on file changes.

---

## Authentication Flow

Every endpoint (except `GET /`) requires a valid Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <supabase-access-token>
```

The flow:

1. Frontend calls `supabase.auth.getSession()` to get the access token
2. Frontend sends it as a Bearer token
3. Backend `get_current_user()` dependency in `dependencies.py` extracts it
4. `security.py` fetches JWKS from Supabase (cached for 1 hour), finds the matching key by `kid`, and verifies the JWT signature using `python-jose`
5. If valid, returns `{"user_id": str, "role": str, "email": str}` which all handlers receive as the `user` parameter
6. If invalid or missing → `401 Unauthorized`

**Key detail:** `verify_aud: False` is set because Supabase JWTs have `aud: "authenticated"` but python-jose's audience check requires explicit opt-in configuration. Disabling it is safe because the signature is still fully verified.

---

## API Endpoints

### `app/main.py` — Global Exception Handler

A catch-all `@app.exception_handler(Exception)` ensures that any unhandled exception produces a `JSONResponse` from **within** FastAPI rather than from Starlette's `ServerErrorMiddleware` (which sits above the CORS middleware). Without this, 500 responses would be generated before CORS headers were added, causing the frontend to receive an opaque network error instead of a useful JSON payload.

```python
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
    )
```

---

### `GET /`

**File:** `app/main.py`  
**Auth:** None  
**Purpose:** Health check  
**Response:** `{"status": "ok"}`

---

### `POST /api/analyze-session/{session_id}`

**File:** `app/api/analyze_session.py`  
**Auth:** Required  
**Query param:** `?async_process=false` (optional, default `false`)  
**Purpose:** Run the full ML pipeline on a session's images; store results in DB.

**What it does (sync mode):**

1. Validates session exists and belongs to the authenticated user
2. Checks session `status == "completed"`
3. Fetches image records from `images` table via `get_session_images()`
4. Requires **at least 3 angles** (fails with 400 if fewer)
5. Calls `analysis_service.analyze_session()` — the full ML pipeline
6. Persists results to `angle_analysis` and `session_analysis` tables (idempotent: deletes existing before inserting)
7. Returns analysis JSON

**Async mode** (`?async_process=true`): Enqueues the ML work as a FastAPI `BackgroundTask` and returns `{"status": "processing"}` immediately. Works but there is no polling/webhook endpoint to check completion — the result just silently appears in the DB.

**Response (sync):**

```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "overwritten": false,
    "is_first_session": false,
    "session_analysis": {
      "per_angle": [
        {"angle_type": "front", "change_score": 0.42, "summary": "Distance-based analysis for front angle."},
        ...
      ],
      "overall_summary": "ML analysis complete. Scores reflect distance from your personal baseline."
    },
    "scores": {
      "change_score": 0.60,
      "trend_score": 0.58
    }
  }
}
```

`is_first_session` is `true` on the very first analysis (no prior data); in that case `change_score` is `0.0` and `trend_score` is `null`. `overall_summary` is `"Baseline established. Future sessions will be compared to this."` for first sessions.

**Used by:** `frontend/src/pages/Result.tsx` (called directly via `fetch`, not `apiClient`)

**Known limitation:** `per_angle[].summary` always says "Distance-based analysis for X angle." — not a real language model summary.

---

### `POST /api/compare-sessions/{current_session_id}/{previous_session_id}`

**File:** `app/api/compare_sessions.py`  
**Auth:** Required  
**Purpose:** Compare two sessions using stored embeddings and per-angle scores.

**Preconditions:** Both sessions must exist, belong to the user, and have `status == "completed"`. They must have been previously analyzed (embeddings and `angle_analysis` rows must exist).

**What it does:**

1. Validates both sessions and that they belong to the authenticated user
2. Calls `comparison_service.compare_sessions(current_session_id, previous_session_id, user_id=user_id)` — `user_id` is required to load the extended comparison layers
3. Loads `angle_analysis` rows for both sessions from DB
4. Loads `session_embeddings` for both sessions from DB
5. Loads `angle_embeddings` for both sessions from DB (graceful no-op if `PHASE4_MIGRATION.sql` not run)
6. Computes per-angle score deltas and per-angle embedding distances
7. Computes 4 comparison layers: immediate, rolling (last 5), monthly (last 30 days), lifetime (all time)
8. Labels trends: `stable` (<0.1), `mild_variation` (0.1–0.25), `significant_shift` (>0.25)

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
        "embedding_distance": 0.11
      },
      ...
    ],
    "overall_delta": 0.07,
    "stability_index": 0.93,
    "overall_trend": "stable",
    "comparison_method": "embedding",
    "rolling_baseline":  {"delta": 0.09, "trend": "stable",       "available": true},
    "monthly_baseline": {"delta": 0.09, "trend": "stable",       "available": true},
    "lifetime_baseline":{"delta": 0.09, "trend": "stable",       "available": true}
  }
}
```

`available: false` (and `delta: null`, `trend: null`) is returned for a baseline layer when there are not enough prior sessions in that window. Each layer compares the current session embedding against the mean of all prior session embeddings in its respective time window.

**Fallback:** If session embeddings are missing entirely, falls back to score-average delta for `overall_delta`. `comparison_method` becomes `"score"` in that case.

**Used by:** `frontend/src/pages/Result.tsx` (called directly via `fetch`)

---

### `GET /api/session-info/{session_id}`

**File:** `app/api/utility.py`  
**Auth:** Required  
**Purpose:** Return metadata about a session: is it the first ever? what is previous session? how many total?

**DB queries made (4 total):**

1. `get_session()` — verify ownership
2. `sessions` count where `user_id = ?` — total count
3. Oldest session (`order by created_at asc, limit 1`) — to determine `is_first_session`
4. Two most recent sessions (`order by created_at desc, limit 2`) — for `is_current` and `previous_session_id`

**Response:**

```json
{
  "session_id": "uuid",
  "is_first_session": true,
  "is_current": true,
  "total_sessions": 1,
  "created_at": "2026-02-16T10:00:00",
  "previous_session_id": null
}
```

`previous_session_id` is the **second most recent** session (not the oldest), used for comparison. It is `null` if this is the first session.

**Used by:** `frontend/src/lib/apiClient.ts` → `apiClient.getSessionInfo()` → called from `Result.tsx`

---

### `GET /api/image-preview/{session_id}/{image_type}`

**File:** `app/api/utility.py`  
**Auth:** Required  
**Purpose:** Generate a 1-hour signed URL for a single image. Uses the service role key server-side so signed URLs are never generated from the frontend with the anon key.

**`image_type` values:** `front`, `left`, `right`, `up`, `down`, `raised`

**Response:**

```json
{
  "preview_url": "https://vtpgeaqhkbbpvaigxwgq.supabase.co/storage/v1/object/sign/...",
  "expires_in": 3600,
  "image_type": "front"
}
```

**Signed URL detection:** The Supabase Python SDK returns the URL differently depending on version (`signedUrl` key in dict, or wrapped in a `.data` object). The code handles both formats.

**Used by:** `frontend/src/lib/apiClient.ts` → `apiClient.getImagePreview()` → called from `Result.tsx` (6 parallel calls, one per angle)

---

### `GET /api/session-thumbnails/{session_id}`

**File:** `app/api/utility.py`  
**Auth:** Required  
**Purpose:** Batch version of image-preview — returns signed URLs for all images in a session in one request.

**Response:**

```json
{
  "session_id": "uuid",
  "thumbnails": {
    "front": "https://...",
    "left": "https://...",
    "right": "https://...",
    "up": "https://...",
    "down": "https://...",
    "raised": "https://..."
  },
  "count": 6
}
```

**Used by:** `frontend/src/lib/apiClient.ts` → `apiClient.getSessionThumbnails()` — **currently not called by any frontend page** (History.tsx was updated to remove thumbnail loading for privacy reasons). This endpoint is implemented and working but unused.

---

### `GET /api/sessions/{session_id}/analysis`

**File:** `app/api/session_analysis.py`  
**Auth:** Required  
**Purpose:** Read back already-stored analysis results from the database without re-running ML. Useful for revisiting a session that was already analyzed.

**Response:**

```json
{
  "success": true,
  "data": {
    "session_analysis": {
      "session_id": "uuid",
      "overall_change_score": 0.42,
      "created_at": "2026-02-16T10:00:00",
      "per_angle": [
        {"angle_type": "front", "change_score": 0.1, "summary": "..."},
        ...
      ]
    }
  }
}
```

Returns 404 if the session has never been analyzed.

**Used by:** Not currently called anywhere in the frontend. Available for future use (e.g. loading historic session detail without re-running ML).

---

### `POST /api/generate-report/{session_id}`

**File:** `app/api/generate_report.py`  
**Auth:** Required  
**Purpose:** Generate a summary report for a session.

**⚠️ STATUS: STUB.** `report_service.py` reads `session_analysis` and `angle_analysis` from DB and returns:

```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "overall_change_score": 0.42,
    "created_at": "...",
    "per_angle": [...],
    "summary": "Placeholder report generated from stored analysis."
  }
}
```

`summary` is a hardcoded string. No PDF generation, no email, no real report logic. Needs to be built out before this endpoint is useful.

**Used by:** Nothing in the frontend currently.

---

## Services Layer

### `services/db.py`

Creates and returns a Supabase client using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Called by every service and some API handlers. A new client is instantiated on every call (no connection pooling — acceptable for Supabase's HTTP-based API).

### `services/session_service.py`

`get_session(session_id, user_id) → dict`  
Queries `sessions` table, filters by both `id` and `user_id` to enforce ownership. Returns `{}` if not found (not `None`, so callers must check truthiness with `if not session:`).

### `services/image_service.py`

`get_session_images(session_id, user_id) → list[dict]`  
Returns all rows from `images` table for the session. Each row: `{id, image_type, storage_path, created_at}`.

### `services/analysis_service.py`

The core ML pipeline. Called by `analyze_session` API. Fully rewritten in Phase 4.

**`analyze_session(images, user_id, session_id) → dict`**

Aggregation hierarchy: `image → angle embedding (mean of images for that angle) → session embedding (mean of angle embeddings)`

1. `_load_user_baseline(user_id, exclude_session_id)` — queries `session_embeddings` for all prior sessions (excluding current), parses embeddings from JSON text, returns mean `np.float32` vector or `None` if first session
2. `_load_trend_score(user_id, exclude_session_id, n=5)` — queries `session_analysis` for last 5 sessions' `overall_change_score` values, returns their mean or `None` if no history
3. Groups all images by `angle_type`
4. For each angle group:
   - For each image: `preprocess_pipeline()` → `extract_embedding(processed_image, user_mean=user_baseline)`
   - Angle embedding = `np.mean(image_embeddings_for_angle, axis=0)`
   - `change_score = _cosine_distance(angle_embedding, user_baseline)` — correctly compares against the user's personal baseline (first session → 0.0)
5. Session embedding = `np.mean(list(angle_embeddings.values()), axis=0)`
6. `_store_angle_embeddings()` — persists per-angle embeddings to `angle_embeddings` table (idempotent; silently skips if `PHASE4_MIGRATION.sql` not run yet)
7. `_store_session_embedding()` — persists session embedding to `session_embeddings` table (idempotent)
8. `overall_change_score = _cosine_distance(session_embedding, user_baseline)` (first session → 0.0)
9. Returns `{per_angle, overall_summary, scores: {overall_change_score, trend_score, is_first_session}}`

### `services/comparison_service.py`

Called by `compare_sessions` API. Fully rewritten in Phase 4 to support 5 structured comparison layers.

**`compare_sessions(current_session_id, previous_session_id, user_id) → dict`**

| Layer           | Loader                                                     | Description                                                     |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| 1 – Immediate   | `_load_session_embedding()` ×2                             | Cosine distance between current and previous session embeddings |
| 2 – Rolling     | `_load_rolling_baseline(user_id, current_session_id, n=5)` | Current vs mean of last 5 prior sessions                        |
| 3 – Monthly     | `_load_monthly_baseline(user_id, current_session_id)`      | Current vs mean of sessions in the last 30 days                 |
| 4 – Lifetime    | `_load_lifetime_baseline(user_id, current_session_id)`     | Current vs mean of ALL prior sessions                           |
| 5 – Angle-level | `_load_angle_embeddings()` ×2 + `_load_angle_scores()` ×2  | Per-angle cosine distance + score delta                         |

All loaders gracefully return `None` / `{}` when no data is available. Trend threshold: `stable` < 0.1, `mild_variation` < 0.25, `significant_shift` ≥ 0.25. Raises `ValueError` if `angle_analysis` rows are missing for either session (i.e. `analyze-session` was never run).

### `services/analysis_fetch_service.py`

`get_session_analysis(session_id, user_id) → dict`  
Read-only. Queries `session_analysis` and `angle_analysis` tables and returns structured results. No ML. Used by the `GET /api/sessions/{session_id}/analysis` endpoint.

### `services/report_service.py`

`generate_report(session_id, user_id) → dict`  
Stub. Same DB reads as `analysis_fetch_service` with a hardcoded `summary` field appended. Needs real implementation.

---

## Processing Layer

### `processing/preprocessing.py`

Full image preprocessing pipeline. Called only from `analysis_service.py`.

| Function                                  | What it does                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `load_image_from_storage(path, supabase)` | Downloads from `bcd-images` bucket using service role, opens with PIL, converts to RGB numpy array |
| `normalize_image(image)`                  | Converts to YUV, runs histogram equalization on Y channel, converts back to RGB float              |
| `align_image(image)`                      | Center-square crop                                                                                 |
| `resize_image(image)`                     | Resizes to 224×224 (ResNet input size) using INTER_AREA                                            |
| `preprocess_pipeline(path, supabase)`     | Runs all four steps in sequence                                                                    |

### `processing/embedding.py`

ResNet50 feature extractor. Called only from `analysis_service.py`.

| Thing              | Detail                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Model              | `torchvision.models.resnet50(weights=ResNet50_Weights.DEFAULT)` with the final classification layer removed                       |
| Output             | 2048-dimensional float32 vector                                                                                                   |
| Device             | CUDA if available, else CPU                                                                                                       |
| Singleton          | `get_encoder()` loads the model once into `_encoder` global; subsequent calls reuse it. First request takes ~2s to load the model |
| Normalization      | ImageNet mean/std applied via `transforms.Normalize` during preprocessing                                                         |
| User normalization | If `user_mean` is provided, the embedding is mean-subtracted: `embedding = embedding - user_mean`                                 |

### `processing/session_analysis.py`

`compute_session_scores(embeddings) → dict`  
**⚠️ STUB. NOT USED.** Returns hardcoded `{"overall_change_score": 0.1}`. The real logic lives in `analysis_service.py`. This file is dead code.

### `processing/trend_analysis.py`

`compute_trend(scores) → dict`  
**⚠️ STUB. NOT USED.** Returns hardcoded `{"overall_trend": "stable"}`. The real trend logic lives in `comparison_service.py`. This file is dead code.

---

## Database Tables Used

| Table                | Used by                                                           | Purpose                                                                                               |
| -------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `sessions`           | `session_service`, `utility.py` (session-info)                    | Session records with `status` field                                                                   |
| `images`             | `image_service`, `utility.py` (image-preview, thumbnails)         | Per-angle image records with `storage_path`                                                           |
| `session_analysis`   | `analyze_session`, `analysis_fetch_service`, `report_service`     | One row per session: `overall_change_score`, `trend_score`, `rolling/monthly/lifetime_baseline_score` |
| `angle_analysis`     | `analyze_session`, `analysis_fetch_service`, `comparison_service` | One row per angle per session: `change_score`, `summary`                                              |
| `session_embeddings` | `analysis_service`, `comparison_service`                          | 2048-dim ResNet50 session-level embedding, stored as JSON text                                        |
| `angle_embeddings`   | `analysis_service`, `comparison_service`                          | 2048-dim ResNet50 per-angle embedding; created by `PHASE4_MIGRATION.sql`                              |

**`session_analysis` columns added in Phase 4** (requires `PHASE4_MIGRATION.sql`):

- `trend_score float` — moving average of last 5 sessions' `overall_change_score`
- `rolling_baseline_score float` — score vs rolling window baseline
- `monthly_baseline_score float` — score vs 30-day baseline
- `lifetime_baseline_score float` — score vs lifetime baseline

All new columns are optional; the insert falls back to omitting them if the migration has not yet been run.

**Important — `session_embeddings.embedding` column type:** Embeddings are stored as JSON text (not a native array type). Both `analysis_service.py` and `comparison_service.py` handle this with:

```python
if isinstance(emb, str):
    emb = json.loads(emb)
return np.array(emb, dtype=np.float32)
```

If you run `PHASE3_MIGRATION.sql` to change the column type to a native array, remove this parsing logic. The same pattern applies to `angle_embeddings.embedding`.

---

## Auth & Security

### `utils/security.py`

**`decode_supabase_jwt(token, jwks_url, algorithm) → dict`**

1. Parses JWT header (unverified) to get `kid`
2. Checks in-memory `_jwks_cache` dict (`{url: (keys_list, fetched_at)}`) — keys are reused for up to 1 hour without hitting Supabase
3. Fetches JWKS via HTTP GET if cache is stale
4. Finds key matching `kid`; if not found, invalidates cache and refreshes once (handles key rotation)
5. Constructs EC key via `jwk.construct(key_data)` from `python-jose`
6. Calls `jwt.decode(token, key, algorithms=["ES256"], options={"verify_aud": False})`
7. Returns `{user_id, role, email}`

**Why ES256 not RS256:** Supabase switched to ES256 for all JWTs. RS256 will raise `"The specified alg value is not allowed"`.

**Why `verify_aud: False`:** Supabase JWTs carry `aud: "authenticated"`. python-jose's audience verification requires the expected audience be passed explicitly; disabling it is safe because the signature is still cryptographically verified.

### `app/dependencies.py`

**`get_current_user(authorization: str | None)`** — FastAPI dependency injected into every protected route via `Depends(get_current_user)`. Extracts Bearer token, calls `decode_supabase_jwt`, raises `401` on any failure.

---

## Request/Response Contract with Frontend

The frontend (`frontend/src/lib/apiClient.ts`) calls these endpoints:

| `apiClient` method                        | Backend endpoint                            | Notes                                                     |
| ----------------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| `getSessionInfo(sessionId, token)`        | `GET /api/session-info/{sessionId}`         | Called first on Result page                               |
| `getImagePreview(sessionId, type, token)` | `GET /api/image-preview/{sessionId}/{type}` | Called 6× in parallel on Result page                      |
| `getSessionThumbnails(sessionId, token)`  | `GET /api/session-thumbnails/{sessionId}`   | Defined in apiClient but not called by any page currently |

The `analyze-session` and `compare-sessions` calls in `Result.tsx` are made directly via `fetch()`, not through `apiClient`.

---

## Tests (`tests/test_api.py`)

Uses `pytest` + FastAPI `TestClient` with dependency overrides and `monkeypatch`.

| Test                                  | What it checks                                                |
| ------------------------------------- | ------------------------------------------------------------- |
| `test_analyze_session_success`        | Happy path: 6 images, mock ML, returns 200 with correct shape |
| `test_analyze_session_missing_angles` | Only 1 image → must return 400                                |
| `test_compare_sessions_success`       | Two valid sessions, mock comparison → 200                     |
| `test_fetch_session_analysis`         | Stored analysis GET → 200                                     |

**How to run:**

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/ -v
```

**Note:** Tests mock out `get_session`, `get_session_images`, `run_analysis`, `run_comparison`, and `get_supabase_client` so no real DB or ML is needed. The `run_analysis` mock in `test_analyze_session_success` has a signature mismatch — it accepts only `_images` but the real `run_analysis` (imported as `analyze_session`) takes `(images, user_id, session_id)`. This causes a `TypeError` on that test. Needs to be fixed.

---

## Known Issues & TODOs

### Bugs

| #   | Location                | Issue                                                                                                                 |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | `tests/test_api.py` L76 | Mock `run_analysis` signature takes 1 arg but real function takes 3 → `test_analyze_session_success` will `TypeError` |

### Stubs (not yet implemented)

| #   | Location                         | What's needed                                              |
| --- | -------------------------------- | ---------------------------------------------------------- |
| 3   | `services/report_service.py`     | Real report generation (PDF? structured summary? email?)   |
| 4   | `processing/session_analysis.py` | Dead code — `compute_session_scores()` not called anywhere |
| 5   | `processing/trend_analysis.py`   | Dead code — `compute_trend()` not called anywhere          |

### Missing features

| #   | What                             | Notes                                                                                                            |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 6   | Async analysis status endpoint   | `?async_process=true` enqueues work but there's no `GET /api/analyze-status/{session_id}` to poll for completion |
| 7   | CORS lockdown                    | `allow_origins=["*"]` — fine for dev, should be restricted to the frontend domain in production                  |
| 8   | Rate limiting                    | No rate limiting on any endpoint; the ML endpoint is expensive (~2-4s per call)                                  |
| 9   | `session_embeddings` column type | Stored as JSON string; could be changed to native `vector` type (pgvector) or `float[]` for efficiency           |

---

## Dependencies (`requirements.txt`)

| Package         | Version  | Purpose                                        |
| --------------- | -------- | ---------------------------------------------- |
| `fastapi`       | 0.110.0  | Web framework                                  |
| `uvicorn`       | 0.27.1   | ASGI server                                    |
| `python-dotenv` | 1.0.1    | Load `.env` into `os.environ`                  |
| `supabase`      | 2.10.0   | Supabase Python client (DB + Storage)          |
| `python-jose`   | 3.3.0    | JWT decode and JWKS key construction           |
| `cryptography`  | 41.0.7   | Required by python-jose for EC key support     |
| `requests`      | 2.32.3   | HTTP client for JWKS fetch                     |
| `pytest`        | 7.4.0    | Test runner                                    |
| `httpx`         | 0.27.0   | Async HTTP client (used by FastAPI TestClient) |
| `torch`         | 2.1.0    | PyTorch — ResNet50 inference                   |
| `torchvision`   | 0.16.0   | ResNet50 model + ImageNet transforms           |
| `opencv-python` | 4.8.1.78 | Image normalization (histogram eq), resize     |
| `pillow`        | 10.1.0   | Image loading from bytes                       |
| `numpy`         | 1.24.3   | All numerical operations on embeddings         |

**Install:**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

> `torch` and `torchvision` are large (~1-2GB). The first install will take several minutes.

---

## Data Flow — Full Session Analysis

```
Browser (Result.tsx)
  │
  ├─ GET /api/session-info/{id}  ──────────────────────────────┐
  │    └─ utility.py                                           │
  │         └─ sessions table (4 queries)                      │
  │         └─ returns: is_first_session, previous_session_id  │
  │                                                            │
  ├─ GET /api/image-preview/{id}/{type}  ×6 (parallel) ────────┤
  │    └─ utility.py                                           │
  │         └─ images table (1 query per call)                 │
  │         └─ supabase.storage.create_signed_url()            │
  │         └─ returns: preview_url (1hr signed URL)           │
  │                                                            │
  ├─ POST /api/analyze-session/{id}  ──────────────────────────┤
  │    └─ analyze_session.py                                   │
  │         └─ session_service: verify session ownership       │
  │         └─ image_service: fetch image records              │
  │         └─ analysis_service.analyze_session()              │
  │              ├─ load_user_baseline() — session_embeddings  │
  │              ├─ load_trend_score() — session_analysis      │
  │              ├─ Group images by angle_type                 │
  │              ├─ For each angle group:                      │
  │              │    ├─ For each image in group:              │
  │              │    │    ├─ preprocessing.preprocess_pipeline()│
  │              │    │    │    ├─ storage.download(path)      │
  │              │    │    │    ├─ normalize (histogram eq)    │
  │              │    │    │    ├─ center crop                 │
  │              │    │    │    └─ resize to 224×224           │
  │              │    │    └─ embedding.extract_embedding()    │
  │              │    │         └─ ResNet50 → 2048-dim vector  │
  │              │    └─ angle_embedding = mean(image_embeds)  │
  │              ├─ session_embedding = mean(angle_embeds)     │
  │              ├─ store angle_embeddings → angle_embeddings  │
  │              ├─ store session embedding → session_embeds   │
  │              └─ persist → angle_analysis, session_analysis │
  │         └─ returns: per_angle scores, overall_summary,     │
  │                      is_first_session, trend_score         │
  │                                                            │
  └─ POST /api/compare-sessions/{id}/{prev_id}  ───────────────┘
       └─ compare_sessions.py  (only if not first session)
            └─ comparison_service.compare_sessions(current, previous, user_id)
                 ├─ load angle_analysis for both sessions
                 ├─ load session_embeddings for both sessions
                 ├─ load angle_embeddings for both sessions (if table exists)
                 ├─ Layer 1: cosine distance between session embeddings
                 ├─ Layer 2: rolling baseline (mean of last 5 prior sessions)
                 ├─ Layer 3: monthly baseline (mean of last 30 days)
                 ├─ Layer 4: lifetime baseline (mean of all prior sessions)
                 ├─ Layer 5: per-angle embedding distances + score deltas
                 └─ returns: per_angle, overall_delta, overall_trend,
                             rolling/monthly/lifetime_baseline layers
```
