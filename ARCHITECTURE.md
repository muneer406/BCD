# BCD System Architecture

## Overview

BCD (Breast Changes Detection) is a **time-series visual tracking system** with a privacy-first design. The system captures standardized multi-angle photos, stores them securely, and enables historical comparison.

```
┌─────────────────────────────────────────────────────────────┐
│                     USER BROWSER                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React Frontend (TypeScript + Tailwind)              │   │
│  │  - Auth pages (Login/Signup)                         │   │
│  │  - Capture flow (6-angle protocol)                   │   │
│  │  - Result viewer (session + historical comparison)   │   │
│  │  - History timeline                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↓ HTTPS
         ┌────────────────────────────────┐
         │    SUPABASE SERVICES           │
         ├────────────────────────────────┤
         │ 1. Auth (JWT tokens)           │
         │ 2. PostgreSQL DB (RLS)         │
         │ 3. Object Storage (S3-compat)  │
         └────────────────────────────────┘
                          ↓ (Phase 2)
         ┌────────────────────────────────┐
         │  BACKEND API (FastAPI)         │
         ├────────────────────────────────┤
         │ - ML anomaly detection         │
         │ - Image processing             │
         │ - Change score calculation     │
         │ - Report generation            │
         └────────────────────────────────┘
```

---

## Data Flow

### Session Capture Flow

```
1. User initiates capture session
   ↓
2. Camera interface (6 angles required)
   ├─ Front view
   ├─ Left side
   ├─ Right side
   ├─ Upward angle
   ├─ Downward angle
   └─ Full body
   ↓
3. Images stored in Supabase Storage (/bcd-images bucket)
   - Private access (RLS enforced)
   - Path: {user_id}/{session_id}/{image_type}_{timestamp}.jpg
   ↓
4. Metadata stored in PostgreSQL (images table)
   - image_id, session_id, user_id, image_type, storage_path
   ↓
5. Session marked complete
   ↓
6. Result page displays:
   - This Session: per-angle observations + per-angle previews
   - Over Time: comparisons with historical sessions
```

### Historical Comparison Flow

```
1. User views /result/:sessionId or /result (latest)
   ↓
2. Frontend queries:
   - Current session (images + metadata)
   - Previous sessions for trend analysis
   ↓
3. Images retrieved via signed URLs (temporary, 1-hour expiry)
   ↓
4. Comparisons rendered:
   - vs last session
   - vs last 5 sessions
   - vs last month
   - overall trend
   ↓
5. Visual indicators show:
   - Stability (no visible shift)
   - Mild variation (small changes)
   - Trend direction
```

---

## Database Schema

### Core Tables

```sql
-- Sessions: User capture sessions
sessions {
  id: UUID (PK)
  user_id: UUID (FK → auth.users)
  created_at: TIMESTAMP
  notes: TEXT (optional)
  status: TEXT ('in_progress', 'completed', 'reviewed')
}

-- Images: Metadata for captured images
images {
  id: UUID (PK)
  session_id: UUID (FK)
  user_id: UUID (FK)
  image_type: TEXT ('front', 'left', 'right', 'up', 'down', 'raised')
  storage_path: TEXT (S3 path)
  created_at: TIMESTAMP
}

-- Disclaimer acceptance: Privacy/consent tracking
disclaimer_acceptance {
  id: UUID (PK)
  user_id: UUID (FK, UNIQUE)
  accepted_at: TIMESTAMP
}

-- User profiles: Optional for future expansion
user_profiles {
  id: UUID (PK, FK → auth.users)
  email: TEXT
  created_at: TIMESTAMP
}
```

### Row-Level Security (RLS)

**All tables have RLS enabled:**

- Users can only see their own sessions and images
- Auth policies enforce user_id matching
- Storage bucket policies require signed URLs

---

## Frontend Architecture

### Directory Structure

```
frontend/src/
├── pages/              # Route components
│  ├── Landing.tsx      # Public homepage
│  ├── Login.tsx        # Auth page
│  ├── Signup.tsx       # Auth page
│  ├── Disclaimer.tsx   # Consent gate
│  ├── Capture.tsx      # 6-angle capture flow
│  ├── Review.tsx       # Pre-submission review
│  ├── Result.tsx       # Session results + history
│  └── History.tsx      # Session timeline
│
├── components/         # Reusable UI components
│  ├── Button.tsx       # Primary/outline/ghost variants
│  ├── Card.tsx         # Content container
│  ├── ImageModal.tsx   # Click-to-expand overlay
│  ├── PageShell.tsx    # Max-width + spacing wrapper
│  ├── AppHeader.tsx    # Nav bar with auth state
│  ├── RouteGuards.tsx  # Auth/disclaimer protection
│  └── SectionHeading.tsx # Page title + description
│
├── context/            # State management
│  ├── AuthContext.tsx  # User state + login/logout
│  └── DraftContext.tsx # Session draft (in-progress captures)
│
├── lib/                # Utilities
│  └── supabaseClient.ts # Supabase configuration
│
├── data/               # Static/config data
│  └── captureSteps.ts  # 6-angle definitions
│
└── App.tsx             # Route definitions + top-level guards
```

### Component Hierarchy

```
App
├── RouteGuards (RequireAuth, RequireDisclaimer)
├── Landing (public)
├── Login (public)
├── Signup (public)
├── Disclaimer (protected)
├── Capture (protected)
│  └── 6-angle grid with image uploads
├── Review (protected)
│  └── Session preview before save
├── Result (protected)
│  ├── This Session section
│  │  └── Per-angle cards with previews & downloads
│  └── Over Time section
│     └── Historical comparisons
└── History (protected)
   └── Session timeline with trend indicators
```

---

## Frontend State Management

### Auth Context

- Manages login/logout
- Stores user object and JWT token
- Provides disclaimer acceptance state
- Handles auto-refresh on app load

### Draft Context

- Stores in-progress captures
- Manages images by angle type
- Clears on session save
- Provides image preview URLs

---

## Frontend Features

### Capture Flow

- **6-angle protocol**: Enforces all angles before session save
- **Multiple images per angle**: Supported for better accuracy
- **Progress tracking**: Visual progress bar (X of 6 angles)
- **Image preview**: Click-to-expand modal
- **Responsive upload**: Works on mobile with camera access

### Result Page (Phase 1)

- **This Session**: Per-angle observations + image previews + download buttons
- **Over Time**: Historical comparisons across 4 time windows
- **First-session messaging**: Special indicator that this is the baseline
- **Neutral language**: No diagnostic terminology
- **Visual hierarchy**: Clear separation of session vs historical analysis

### History Page

- **Pagination**: 6 sessions per page with load-more button
- **Preview thumbnails**: First image from each session
- **Trend indicators**: Latest/Baseline/Historical tags
- **Clickable cards**: Link to /result/:sessionId for viewing

---

## Styling & Design

### Color System (Tailwind)

- **Primary**: Tide blue (#0E7C90)
- **Secondary**: Sand beige (#F4EBE0)
- **Accent**: Ink dark gray (#1A1A1A)
- **Support**: Soft grays for UI chrome

### Responsive Design

- **Mobile-first** Tailwind breakpoints (sm, md, lg)
- **Touch targets**: Min 44px height for buttons
- **Lazy loading**: Images lazy-loaded in galleries
- **Modal overlays**: Click-to-expand for full resolution

---

## Security Model

### Authentication

- **Supabase Auth**: Email/password via JWT
- **Session tokens**: Stored in browser localStorage
- **Auto-refresh**: Token refresh on app load

### Authorization

- **Row-Level Security (RLS)**: PostgreSQL policies
- **Private storage**: Signed URLs required, 1-hour expiry
- **User isolation**: user_id in all queries

### Privacy

- **No tracking**: No analytics or third-party scripts
- **Secure transit**: HTTPS/TLS for all requests
- **Minimal data**: Only email + image storage
- **Deletion option**: Users can request data deletion (future)

---

## API Integration Points (Phase 2)

The following endpoints will be added to the backend:

### Analysis Service

```
POST /api/analyze-session/{session_id}
- Input: session_id (all images already stored)
- Output: {
    session_analysis: {
      per_angle: [...],
      overall_summary: "..."
    },
    scores: {
      change_score: 0.0-1.0,
      confidence: 0.0-1.0,
      embedding: [...]
    }
  }
```

### Comparison Service

```
POST /api/compare-sessions/{current_id}/{previous_id}
- Input: two session_ids
- Output: {
    per_angle_changes: [...],
    trend_direction: "stable|mild_change|significant_change",
    recommendations: "..."
  }
```

### Report Generation

```
GET /api/generate-report/{session_id}?format=pdf
- Output: PDF report for sharing with healthcare provider
```

---

## Deployment

### Frontend (Vercel)

- Automatic deployments from `master` branch
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`
- Built with `npm run build`

### Database (Supabase)

- Hosted PostgreSQL with automatic backups
- Run migrations via SQL Editor
- RLS policies enforce data privacy

### Backend (Phase 2)

- Planned: Railway or Cloud Run
- FastAPI with async processing
- Connected to same Supabase instance

---

## Development Workflow

1. **Frontend changes**: `npm run dev` in `frontend/` directory
2. **Supabase changes**: Update schema in SQL Editor, save migrations to `SUPABASE_MIGRATIONS.sql`
3. **Push to GitHub**: Commits automatically trigger Vercel deployment
4. **Testing**: Test auth flow, capture, storage, and history comparison

---

## Future Considerations

- **Mobile app**: React Native sharing components with web
- **Embedding storage**: Save ML embeddings for faster comparisons
- **Batch processing**: Queue image processing for high load
- **Regional storage**: Multi-region S3 for faster downloads
- **Offline support**: Service workers for offline capture (Phase 3)
