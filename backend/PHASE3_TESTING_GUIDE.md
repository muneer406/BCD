# Phase 3 Testing Guide

**Date:** February 16, 2026  
**Goal:** Test real ML pipeline with actual images

---

## Current Status ✅

**What's Working:**

- JWT validation ✅
- Model loading (ResNet50) ✅
- Image preprocessing pipeline (ready) ✅
- Embedding extraction (ready) ✅

**What's Needed:**

- Actual images uploaded to Supabase Storage

---

## Error Explanation

```
PIL.UnidentifiedImageError: cannot identify image file
```

This error means:

- ✅ Backend is correctly trying to load images
- ✅ Storage path is being retrieved
- ❌ No valid image bytes at that storage path
- ❌ Session images table has storage paths, but files don't exist in Supabase Storage

**This is expected** - the frontend would normally upload images during the capture process.

---

## How to Test Phase 3

### Option 1: Upload Real Images via Supabase Dashboard (Recommended)

#### Step 1: Prepare Test Images

Get 6 JPG/PNG images representing different angles:

- `front.jpg` - front view
- `left.jpg` - left profile
- `right.jpg` - right profile
- `up.jpg` - upward angle
- `down.jpg` - downward angle
- `raised.jpg` - raised arms view

**Image requirements:**

- Format: JPG or PNG
- Size: 500x500 to 2000x2000 pixels
- Any content (doesn't need to be medical)

#### Step 2: Upload to Supabase Storage

1. Go to: `https://supabase.com/dashboard/project/vtpgeaqhkbbpvaigxwgq`
2. Click **Storage** in left sidebar
3. Click **bcd-images** bucket
4. Click **Upload** and select your 6 images
5. Upload path should be: `{user-id}/{session-id}/` where:
   - `user-id` = `40470094-88e9-438b-b379-bbfb56828284` (from your JWT)
   - `session-id` = `5839fb9a-0569-4f09-b4b7-c407dfcba3fe` (the test session)

**Example final paths:**

```
bcd-images/40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/front.jpg
bcd-images/40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/left.jpg
...
```

#### Step 3: Update Image Records in Database

The `images` table needs to reference these storage paths. Run this SQL in Supabase:

```sql
-- Get the session and user IDs
SELECT * FROM images WHERE session_id = '5839fb9a-0569-4f09-b4b7-c407dfcba3fe' LIMIT 5;

-- If no images exist, create them:
INSERT INTO public.images (session_id, user_id, image_type, storage_path) VALUES
  ('5839fb9a-0569-4f09-b4b7-c407dfcba3fe', '40470094-88e9-438b-b379-bbfb56828284', 'front', '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/front.jpg'),
  ('5839fb9a-0569-4f09-b4b7-c407dfcba3fe', '40470094-88e9-438b-b379-bbfb56828284', 'left', '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/left.jpg'),
  ('5839fb9a-0569-4f09-b4b7-c407dfcba3fe', '40470094-88e9-438b-b379-bbfb56828284', 'right', '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/right.jpg'),
  ('5839fb9a-0569-4f09-b4b7-c407dfcba3fe', '40470094-88e9-438b-b379-bbfb56828284', 'up', '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/up.jpg'),
  ('5839fb9a-0569-4f09-b4b7-c407dfcba3fe', '40470094-88e9-438b-b379-bbfb56828284', 'down', '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/down.jpg'),
  ('5839fb9a-0569-4f09-b4b7-c407dfcba3fe', '40470094-88e9-438b-b379-bbfb56828284', 'raised', '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/raised.jpg');
```

#### Step 4: Test the API

```bash
curl -X POST "http://127.0.0.1:8000/api/analyze-session/5839fb9a-0569-4f09-b4b7-c407dfcba3fe" \
  -H "Authorization: Bearer $env:BCD_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected response (after 1-4 seconds):**

```json
{
  "success": true,
  "data": {
    "session_id": "5839fb9a-0569-4f09-b4b7-c407dfcba3fe",
    "overwritten": false,
    "session_analysis": {
      "per_angle": [
        {
          "angle_type": "front",
          "change_score": 0.45,
          "summary": "Distance-based analysis for front angle."
        },
        ...
      ],
      "overall_summary": "Real ML analysis complete. Baseline: establishing."
    },
    "scores": {
      "change_score": 0.0
    }
  }
}
```

**Key observations:**

- `change_score` will be **0.0** for first session (establishing baseline)
- Per-angle scores will be **non-zero** (based on actual embeddings)
- Response should take **1-4 seconds** (processing time)

---

### Option 2: Create Mock Image Upload Script (Advanced)

If you want to generate test images programmatically:

```python
# test_upload_images.py

import sys
sys.path.insert(0, '/path/to/backend')

from PIL import Image
import numpy as np
from app.services.db import get_supabase_client
import io

# Configuration
USER_ID = "40470094-88e9-438b-b379-bbfb56828284"
SESSION_ID = "5839fb9a-0569-4f09-b4b7-c407dfcba3fe"
ANGLES = ["front", "left", "right", "up", "down", "raised"]

supabase = get_supabase_client()

# Generate test images
for angle in ANGLES:
    # Create random image (512x512 RGB)
    img_array = np.random.randint(0, 256, (512, 512, 3), dtype=np.uint8)
    img = Image.fromarray(img_array)

    # Convert to bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG')
    img_bytes.seek(0)

    # Upload to Supabase
    storage_path = f"{USER_ID}/{SESSION_ID}/{angle}.jpg"
    response = supabase.storage.from_("bcd-images").upload(
        storage_path,
        img_bytes.read(),
        {"content-type": "image/jpeg"}
    )

    print(f"✓ Uploaded {angle}: {storage_path}")

    # Create database record
    supabase.table("images").insert({
        "session_id": SESSION_ID,
        "user_id": USER_ID,
        "image_type": angle,
        "storage_path": storage_path
    }).execute()

    print(f"✓ Created image record for {angle}")

print("\n✓ All images uploaded and recorded!")
```

Run with:

```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate
python test_upload_images.py
```

---

## Testing Workflow

### Test 1: First Session Analysis

```bash
# First analysis (establishes baseline)
curl -X POST "http://127.0.0.1:8000/api/analyze-session/5839fb9a-0569-4f09-b4b7-c407dfcba3fe" \
  -H "Authorization: Bearer $env:BCD_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected:**

- ✅ Response: `change_score: 0.0` (first session)
- ✅ `overall_summary` mentions "Baseline: establishing"
- ✅ Per-angle scores: non-zero (based on real embeddings)
- ⏱️ Time: 1-4 seconds

**Verify:**

```sql
-- Check embeddings stored
SELECT session_id, user_id, array_length(embedding, 1) as embedding_dim
FROM session_embeddings
WHERE session_id = '5839fb9a-0569-4f09-b4b7-c407dfcba3fe';
```

Should show:

- `embedding_dim: 2048` ✅

---

### Test 2: Second Session Analysis (Compare)

#### Step 1: Create/Upload Second Session

Repeat the image upload process but with a **new session ID**. Use UUID:

```
267b9bdb-61fc-497b-8f98-8ed97f8de1c4
```

#### Step 2: Create session and images records

```sql
INSERT INTO sessions (id, user_id, status) VALUES
  ('267b9bdb-61fc-497b-8f98-8ed97f8de1c4', '40470094-88e9-438b-b379-bbfb56828284', 'completed');

INSERT INTO public.images (session_id, user_id, image_type, storage_path) VALUES
  ('267b9bdb-61fc-497b-8f98-8ed97f8de1c4', '40470094-88e9-438b-b379-bbfb56828284', 'front', '40470094-88e9-438b-b379-bbfb56828284/267b9bdb-61fc-497b-8f98-8ed97f8de1c4/front.jpg'),
  ('267b9bdb-61fc-497b-8f98-8ed97f8de1c4', '40470094-88e9-438b-b379-bbfb56828284', 'left', '40470094-88e9-438b-b379-bbfb56828284/267b9bdb-61fc-497b-8f98-8ed97f8de1c4/left.jpg'),
  -- ... repeat for all 6 angles
;
```

#### Step 3: Analyze second session

```bash
curl -X POST "http://127.0.0.1:8000/api/analyze-session/267b9bdb-61fc-497b-8f98-8ed97f8de1c4" \
  -H "Authorization: Bearer $env:BCD_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected:**

- ✅ Response: `change_score: 0.0-1.0` (based on distance from first session baseline)
- ✅ `overall_summary` mentions "Baseline: available"
- ⏱️ Time: 1-4 seconds (no model reload needed)

---

### Test 3: Compare Sessions

```bash
curl -X POST "http://127.0.0.1:8000/api/compare-sessions/267b9bdb-61fc-497b-8f98-8ed97f8de1c4/5839fb9a-0569-4f09-b4b7-c407dfcba3fe" \
  -H "Authorization: Bearer $env:BCD_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected:**

```json
{
  "success": true,
  "data": {
    "per_angle": [...],
    "overall_delta": 0.15,
    "stability_index": 0.85,
    "overall_trend": "stable",
    "comparison_method": "embedding"
  }
}
```

**Key metrics:**

- `overall_delta`: 0-1 range (0 = identical, 1 = completely different)
- `stability_index`: 1 - overall_delta (higher = more stable)
- `overall_trend`: "stable" (<0.1) | "mild_variation" (0.1-0.25) | "significant_shift" (>0.25)
- `comparison_method`: "embedding" (using real embeddings)

---

## Verify Phase 3 Success

### Checklist

- [ ] Images uploaded to Supabase Storage
- [ ] Image records created in database
- [ ] First analysis returns change_score = 0.0
- [ ] Per-angle scores are non-zero
- [ ] Embeddings stored in database (embedding_dim = 2048)
- [ ] Second analysis returns different change_score
- [ ] Comparison uses embedding-based distance
- [ ] Response time acceptable (<4 seconds)
- [ ] No placeholder values in responses

### Database Verification

```sql
-- Check stored embeddings
SELECT
    COUNT(*) as total_embeddings,
    COUNT(DISTINCT session_id) as unique_sessions,
    COUNT(DISTINCT user_id) as unique_users
FROM session_embeddings;

-- Check analysis results
SELECT
    session_id,
    overall_change_score,
    created_at
FROM session_analysis
ORDER BY created_at DESC
LIMIT 10;

-- Check per-angle scores
SELECT
    session_id,
    angle_type,
    change_score,
    summary
FROM angle_analysis
WHERE session_id IN (
    '5839fb9a-0569-4f09-b4b7-c407dfcba3fe',
    '267b9bdb-61fc-497b-8f98-8ed97f8de1c4'
)
ORDER BY session_id, angle_type;
```

---

## Performance Benchmarks

### Expected Timing

| Operation             | Time        | Notes                   |
| --------------------- | ----------- | ----------------------- |
| Model load            | 2 seconds   | First request only      |
| Image load (1 img)    | 100-300ms   | From Supabase Storage   |
| Preprocessing (1 img) | 50-200ms    | OpenCV operations       |
| Embedding (1 img)     | 200-400ms   | ResNet50 inference      |
| Full session (6 imgs) | 1-4 seconds | Including DB operations |

### Performance Tips

1. **Reuse API calls:**
   - Model loads once, reused for all requests
   - No overhead for multiple analyses

2. **Async mode:**

   ```bash
   curl -X POST "http://127.0.0.1:8000/api/analyze-session/{id}?async_process=true" ...
   ```

   - Returns immediately
   - Processing happens in background
   - Check progress with fetch endpoint

3. **Batch processing:**
   - Process multiple sessions sequentially
   - Cost: N × (1-4 seconds)

---

## Troubleshooting

### Issue: "Image not found" error

**Cause:** Storage path in database doesn't match actual file location

**Solution:**

1. Check Supabase Storage for actual file paths
2. Update database records with correct paths
3. Ensure user_id and session_id match

### Issue: "Timeout" after 30 seconds

**Cause:** Image processing taking too long

**Solution:**

1. Use async mode with `?async_process=true`
2. Reduce image size (<2000x2000)
3. Use GPU if available (set `DEVICE = "cuda"`)

### Issue: "Out of memory" error

**Cause:** Large images + ResNet50 model

**Solution:**

1. Reduce image size
2. Use smaller model (EfficientNet-B0)
3. Increase available RAM

### Issue: Embeddings not stored

**Cause:** Database migration not applied

**Solution:**
Run migration in Supabase:

```sql
ALTER TABLE public.session_embeddings
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
```

---

## Next Steps

### After Successful Testing

1. **Test with frontend:**
   - Verify frontend upload → backend analysis flow
   - Check response handling on client

2. **Test with multiple users:**
   - Create second user account
   - Verify RLS prevents cross-user access
   - Test baseline per-user

3. **Performance testing:**
   - Load test with concurrent requests
   - Monitor GPU/CPU usage
   - Identify bottlenecks

4. **Production deployment:**
   - Set up CI/CD pipeline
   - Deploy to Railway or Cloud Run
   - Configure monitoring

---

## Support

If you encounter issues:

1. **Check uvicorn logs** for detailed error messages
2. **Verify database records** with provided SQL queries
3. **Test image manually** with PIL:
   ```python
   from PIL import Image
   img = Image.open("test_image.jpg")
   print(img.size, img.mode)
   ```
4. **Check file permissions** in Supabase Storage

---

**Document Version:** 1.0  
**Last Updated:** February 16, 2026
