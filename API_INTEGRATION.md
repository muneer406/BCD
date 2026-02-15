# API Integration Plan

Frontend-Backend contract for Phase 2 development.

---

## Overview

The backend will process images and provide analysis results. This document defines the API endpoints and data formats for integration.

---

## Authentication

### Token Validation

All backend endpoints require valid JWT token from Supabase Auth.

```http
POST /api/auth/verify
Content-Type: application/json
Authorization: Bearer {jwt_token}

Response:
{
  "user_id": "uuid",
  "email": "user@example.com",
  "valid": true
}
```

**Usage in Frontend**:

```typescript
const token = await user?.getSession()?.access_token;
const response = await fetch(`${API_URL}/api/auth/verify`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

---

## Session Analysis

### Trigger Analysis

```http
POST /api/analyze/session/{session_id}
Content-Type: application/json
Authorization: Bearer {jwt_token}

Response:
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "analysis": {
      "per_angle": [
        {
          "angle": "front",
          "quality_score": 0.92,
          "embedding": [0.1, 0.2, ...],
          "observations": "Even tone and symmetry"
        },
        ...
      ],
      "overall_summary": "All angles appear balanced with good image quality",
      "analysis_timestamp": "2026-02-15T10:30:00Z"
    }
  }
}
```

**Database Storage**:
After analysis, backend stores results in new `analysis_results` table:

```sql
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id),
  user_id UUID REFERENCES auth.users(id),
  per_angle_analysis JSONB,
  overall_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  analysis_at TIMESTAMP
);
```

### Frontend Integration

```typescript
// After user saves session, trigger analysis
const analyzeSession = async (sessionId: string) => {
  const token = await user?.getSession()?.access_token;

  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/api/analyze/session/${sessionId}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  const result = await response.json();

  // Display on result page if needed
  console.log(result.data.analysis);
};
```

---

## Session Comparison

### Compare Two Sessions

```http
POST /api/compare/sessions
Content-Type: application/json
Authorization: Bearer {jwt_token}

Request Body:
{
  "current_session_id": "uuid",
  "previous_session_id": "uuid"
}

Response:
{
  "success": true,
  "data": {
    "comparison": {
      "time_difference_days": 30,
      "per_angle": [
        {
          "angle": "front",
          "change_magnitude": 0.15,
          "change_direction": "increase",
          "confidence": 0.85,
          "observations": "Slight increase in localized area"
        },
        ...
      ],
      "overall_change_score": 0.12,
      "overall_trend": "stable",
      "recommendation": "Continue regular monitoring"
    }
  }
}
```

**Database Structure**:
Store comparisons for caching (optional):

```sql
CREATE TABLE comparison_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id_1 UUID REFERENCES sessions(id),
  session_id_2 UUID REFERENCES sessions(id),
  comparison_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Frontend Integration

```typescript
// In Result.tsx, compare sessions
const compareWithPrevious = async (currentId: string, previousId: string) => {
  const token = await user?.getSession()?.access_token;

  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/api/compare/sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        current_session_id: currentId,
        previous_session_id: previousId,
      }),
    },
  );

  const result = await response.json();

  // Display in "Over Time" section
  setComparison(result.data.comparison);
};
```

---

## Trend Analysis

### Get Historical Trend

```http
GET /api/trends/{session_id}
Content-Type: application/json
Authorization: Bearer {jwt_token}

Query Parameters:
- window: "week" | "month" | "all" (optional, default: "all")

Response:
{
  "success": true,
  "data": {
    "trends": {
      "front": {
        "history": [
          { "session_id": "uuid", "date": "2026-01-15", "score": 0.10 },
          { "session_id": "uuid", "date": "2026-02-15", "score": 0.12 }
        ],
        "direction": "increasing",
        "volatility": "low",
        "average": 0.11
      },
      ...
    }
  }
}
```

**Use Case**: History page trend indicators and sparklines

---

## Report Generation

### Generate PDF Report

```http
GET /api/reports/{session_id}/pdf
Authorization: Bearer {jwt_token}

Response: PDF binary
Content-Type: application/pdf
Content-Disposition: attachment; filename="BCD_Report_{session_id}.pdf"
```

**Frontend Integration**:

```typescript
const downloadReport = async (sessionId: string) => {
  const token = await user?.getSession()?.access_token;

  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/api/reports/${sessionId}/pdf`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `BCD_Report_${sessionId}.pdf`;
  link.click();
};
```

---

## Data Persistence Strategy

### Option 1: On-Demand (Current Phase 1)

- Analysis computed only when user views result page
- No caching, instant results
- Lower database load
- User waits for computation

### Option 2: Async Processing (Recommended for Phase 2)

- Analysis triggered immediately after session save
- Results stored in `analysis_results` table
- Frontend polls for completion or uses webhooks
- Faster user experience

### Option 3: Real-time with Embeddings (Future)

- Store embeddings in PostgreSQL (with pgvector extension)
- Fast similarity search for comparisons
- Support for trend analysis

**Recommended Approach**: Start with Option 1, move to Option 2 after initial backend setup.

---

## Error Handling

### Standard Error Response

All errors return consistent format:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SESSION",
    "message": "Session not found or unauthorized",
    "status": 404
  }
}
```

### Common Status Codes

| Code | Meaning      | Frontend Action         |
| ---- | ------------ | ----------------------- |
| 200  | Success      | Process response        |
| 400  | Bad request  | Show validation error   |
| 401  | Unauthorized | Redirect to login       |
| 403  | Forbidden    | Show access denied      |
| 404  | Not found    | Show session not found  |
| 500  | Server error | Show "Please try again" |

### Frontend Error Handling

```typescript
const analyzeSession = async (sessionId: string) => {
  try {
    const response = await fetch(`/api/analyze/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const error = await response.json();

      if (response.status === 401) {
        // Redirect to login
        navigate("/login");
      } else if (response.status === 404) {
        setError("Session not found");
      } else {
        setError(error.error.message || "Analysis failed");
      }
      return;
    }

    const result = await response.json();
    setAnalysis(result.data);
  } catch (err) {
    setError("Network error. Please try again.");
  }
};
```

---

## Environment Configuration

### Frontend (.env.local)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:8000  # Development
# VITE_API_URL=https://bcd-api.example.com  # Production
```

### Backend (.env)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
API_PORT=8000
JWT_SECRET_KEY=your-secret
```

---

## Rate Limiting & Quotas

### Recommended Limits

| Endpoint         | Limit | Window   |
| ---------------- | ----- | -------- |
| `/api/analyze/*` | 100   | 24 hours |
| `/api/compare/*` | 500   | 24 hours |
| `/api/trends/*`  | 1000  | 24 hours |

**Implementation**:

```python
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter

@app.post("/api/analyze/{session_id}")
@limiter.limit("100/day")
async def analyze_session(session_id: str):
    ...
```

---

## Testing the Integration

### 1. Local Testing

```bash
# Terminal 1: Start frontend
cd frontend
npm run dev

# Terminal 2: Start backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload

# Terminal 3: Test API
curl -X POST http://localhost:8000/api/analyze/test-session \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Integration Testing Checklist

- [ ] Auth token validation works
- [ ] Session analysis endpoint responds with correct format
- [ ] Comparison endpoint handles two valid sessions
- [ ] Error responses follow standard format
- [ ] File uploads from Supabase Storage work
- [ ] Results are saved correctly
- [ ] Frontend displays analysis results
- [ ] Rate limiting enforced

### 3. E2E Testing Flow

1. User creates new session and uploads 6 images
2. Session saved to database
3. Backend receives analysis trigger
4. Images loaded from Supabase Storage
5. Analysis computed
6. Results stored in `analysis_results` table
7. Frontend retrieves and displays results
8. User navigates to history
9. Trends are calculated and displayed

---

## Migration Path

### Phase 1 (Current)

- ✅ Frontend authentication
- ✅ Image capture and storage
- ✅ Session management
- ✅ History timeline

### Phase 2 (Backend Integration)

1. Set up FastAPI backend
2. Implement `/api/auth/verify` endpoint
3. Create `/api/analyze/session/{id}` with placeholders
4. Add database schema for analysis results
5. Build comparison logic
6. Integrate frontend with analysis endpoints
7. Deploy backend to Cloud Run/Railway

### Phase 3 (ML Integration)

1. Integrate real ML models
2. Add embedding storage
3. Implement similarity search
4. Build advanced analytics

### Phase 4+ (Enhancement)

- Mobile app
- Multi-language support
- Trend notifications
- Healthcare provider sharing
- Advanced reports

---

## Documentation References

- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [frontend/DEVELOPMENT.md](frontend/DEVELOPMENT.md) - Frontend setup
- [backend/DEVELOPMENT.md](backend/DEVELOPMENT.md) - Backend setup
- [Supabase API](https://supabase.com/docs) - Database and storage APIs
