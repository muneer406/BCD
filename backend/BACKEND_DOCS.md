# BCD Backend — Complete Documentation

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
│
├── app/
│   ├── main.py                   # FastAPI app entrypoint, CORS, router registration
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
    "session_analysis": {
      "per_angle": [
        {"angle_type": "front", "change_score": 0.42, "summary": "Distance-based analysis for front angle."},
        ...
      ],
      "overall_summary": "Real ML analysis complete. Baseline: establishing."
    },
    "scores": {
      "change_score": 0.0,
      "confidence": 0.85
    }
  }
}
```

**Used by:** `frontend/src/pages/Result.tsx` (called directly via `fetch`, not `apiClient`)

**Known limitation:** `confidence: 0.85` is hardcoded. `per_angle[].summary` always says "Distance-based analysis for X angle." — not a real language model summary.

---

### `POST /api/compare-sessions/{current_session_id}/{previous_session_id}`

**File:** `app/api/compare_sessions.py`  
**Auth:** Required  
**Purpose:** Compare two sessions using stored embeddings and per-angle scores.

**Preconditions:** Both sessions must exist, belong to the user, and have `status == "completed"`. They must have been previously analyzed (embeddings and `angle_analysis` rows must exist).

**What it does:**

1. Validates both sessions
2. Calls `comparison_service.compare_sessions()`
3. Loads `angle_analysis` rows for both sessions from DB
4. Loads `session_embeddings` for both sessions from DB
5. Computes per-angle score deltas (current - previous)
6. Computes embedding cosine distance for overall comparison
7. Labels trend: `stable` (<0.1), `mild_variation` (0.1–0.25), `significant_shift` (>0.25)

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
        "delta_magnitude": 0.03
      },
      ...
    ],
    "overall_delta": 0.07,
    "stability_index": 0.93,
    "overall_trend": "stable",
    "comparison_method": "embedding"
  }
}
```

**Fallback:** If embeddings are missing, falls back to score-average delta for `overall_delta` and labels trend from that. `comparison_method` becomes `"score"` in that case.

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

The core ML pipeline. Called by `analyze_session` API.

**`analyze_session(images, user_id, session_id) → dict`**

1. `_load_user_baseline()` — fetches all `session_embeddings` for the user, parses JSON strings (embeddings are stored as JSON text in Supabase), casts to `np.float32`, returns mean vector or `None` if first session
2. For each image:
   - `preprocess_pipeline(storage_path, supabase)` — downloads from storage, normalizes, center-crops, resizes to 224×224
   - `extract_embedding(processed_image, user_mean)` — runs ResNet50, subtracts user mean if available
   - Computes `change_score` = cosine distance from zero vector (⚠️ see known issues)
3. Computes mean embedding across all angles → session-level embedding
4. `_store_session_embedding()` — saves session embedding to `session_embeddings` table (idempotent: deletes before inserting)
5. Computes overall change score = cosine distance of session embedding from zero vector (⚠️ see known issues)

**⚠️ Known issue in change score calculation:** The per-angle and overall `change_score` is computed as `cosine_distance(embedding, zeros_like(embedding))`. This is always 1.0 because the cosine distance between any nonzero vector and the zero vector is 1.0 (undefined/maximum). This means **all change_score values will be 1.0 for every non-first session**. The correct calculation should be `_cosine_distance(embedding, user_baseline)` to measure distance from the user's personal baseline. This is a bug that needs to be fixed.

### `services/comparison_service.py`

Called by `compare_sessions` API.

**`compare_sessions(current_session_id, previous_session_id) → dict`**

1. `_load_angle_scores()` — reads `angle_analysis` table for both sessions
2. `_load_session_embedding()` — reads `session_embeddings` for both sessions, parses JSON strings
3. Per-angle delta = `current_score - previous_score`
4. Overall delta = cosine distance between the two session embeddings
5. Trend threshold: stable < 0.1, mild_variation < 0.25, significant_shift ≥ 0.25

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

| Table                | Used by                                                           | Purpose                                                      |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `sessions`           | `session_service`, `utility.py` (session-info)                    | Session records with `status` field                          |
| `images`             | `image_service`, `utility.py` (image-preview, thumbnails)         | Per-angle image records with `storage_path`                  |
| `session_analysis`   | `analyze_session`, `analysis_fetch_service`, `report_service`     | One row per session: `overall_change_score`                  |
| `angle_analysis`     | `analyze_session`, `analysis_fetch_service`, `comparison_service` | One row per angle per session: `change_score`, `summary`     |
| `session_embeddings` | `analysis_service`, `comparison_service`                          | 2048-dim ResNet50 embedding per session, stored as JSON text |

**Important — `session_embeddings.embedding` column type:** Embeddings are stored as JSON text (not a native array type). Both `analysis_service.py` and `comparison_service.py` handle this with:

```python
if isinstance(emb, str):
    emb = json.loads(emb)
return np.array(emb, dtype=np.float32)
```

If you run the `PHASE3_MIGRATION.sql` to change the column type to a native array, remove this parsing logic.

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

| #   | Location                         | Issue                                                                                                                                                   |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `analysis_service.py` L110, L133 | `change_score` computed as `_cosine_distance(embedding, np.zeros_like(embedding))` — always 1.0. Should be `_cosine_distance(embedding, user_baseline)` |
| 2   | `tests/test_api.py` L76          | Mock `run_analysis` signature takes 1 arg but real function takes 3 → `test_analyze_session_success` will `TypeError`                                   |

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
  │              ├─ For each image:                            │
  │              │    ├─ preprocessing.preprocess_pipeline()   │
  │              │    │    ├─ storage.download(path)           │
  │              │    │    ├─ normalize (histogram eq)         │
  │              │    │    ├─ center crop                      │
  │              │    │    └─ resize to 224×224                │
  │              │    └─ embedding.extract_embedding()         │
  │              │         └─ ResNet50 → 2048-dim vector       │
  │              ├─ mean of all angle embeddings               │
  │              ├─ store session embedding → session_embeds   │
  │              └─ persist scores → angle_analysis,           │
  │                                   session_analysis         │
  │         └─ returns: per_angle scores, overall_summary      │
  │                                                            │
  └─ POST /api/compare-sessions/{id}/{prev_id}  ───────────────┘
       └─ compare_sessions.py  (only if not first session)
            └─ comparison_service.compare_sessions()
                 ├─ load angle_analysis for both sessions
                 ├─ load session_embeddings for both sessions
                 ├─ per-angle score deltas
                 ├─ cosine distance between session embeddings
                 └─ returns: per_angle deltas, overall_trend
```
