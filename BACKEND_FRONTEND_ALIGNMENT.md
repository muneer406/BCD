# Backend/Frontend Responsibility Alignment

**Date:** February 16, 2026  
**Status:** ✅ Complete

## Overview

Moved image signing and session metadata operations from frontend to backend to properly separate concerns:
- **Frontend:** UI presentation only, no direct storage/session DB queries
- **Backend:** Business logic, signed URLs, session metadata

## Changes Made

### 1. Backend API Endpoints (`backend/app/api/utility.py`)

Created 3 new utility endpoints:

#### `GET /api/image-preview/{session_id}/{image_type}`
- **Purpose:** Generate signed URL for a single image
- **Security:** Uses service role key (backend-only)
- **Returns:**
  ```json
  {
    "preview_url": "https://signed-url...",
    "expires_in": 3600,
    "image_type": "front"
  }
  ```

#### `GET /api/session-info/{session_id}`
- **Purpose:** Get session metadata and first-session status
- **Replaces:** Frontend session counting queries
- **Returns:**
  ```json
  {
    "session_id": "uuid",
    "is_first_session": true,
    "is_current": true,
    "total_sessions": 1,
    "created_at": "2026-..."
  }
  ```

#### `GET /api/session-thumbnails/{session_id}`
- **Purpose:** Batch fetch all image previews for a session
- **Efficiency:** One request instead of 6 individual requests
- **Returns:**
  ```json
  {
    "session_id": "uuid",
    "thumbnails": {
      "front": "https://signed-url...",
      "left": "https://signed-url...",
      ...
    },
    "count": 6
  }
  ```

### 2. Frontend API Client (`frontend/src/lib/apiClient.ts`)

Created centralized API client:
- Uses `VITE_API_URL` environment variable
- Handles authentication headers
- Type-safe methods for all utility endpoints
- Consistent error handling

### 3. Frontend Updates

#### `Result.tsx`
**Removed:**
- Direct DB query for session count
- Direct signed URL generation

**Added:**
- `apiClient.getSessionInfo()` for metadata
- `apiClient.getImagePreview()` for image URLs

#### `History.tsx`
**Removed:**
- Direct thumbnail URL generation

**Added:**
- `apiClient.getSessionThumbnails()` for batch fetching

### 4. Environment Configuration

#### Frontend (`.env.example`, `.env.local`)
```bash
VITE_API_URL=http://localhost:8000  # NEW: Backend API base URL
```

## Architecture Improvements

### Before
```
Frontend ─┬─> Supabase DB (direct queries)
          └─> Supabase Storage (signed URLs with anon key ❌)
```

### After
```
Frontend ─> Backend API ─┬─> Supabase DB (session metadata)
                         └─> Supabase Storage (signed URLs with service role key ✅)
```

## Benefits

- ✅ Proper separation of concerns
- ✅ Backend has exclusive access to service role key
- ✅ Centralized session metadata logic
- ✅ Single source of truth for API interactions
- ✅ Batch operations for better performance
