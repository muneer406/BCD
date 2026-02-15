# BCD API Integration Contract (Phase 2)

Frontend-Backend contract for BCD (Breast Changes Detection).\
This document defines the **final, simplified, and secure API
structure** for Phase 2 backend integration.

---

# Overview

The backend is responsible for:

- Session-level visual analysis
- Time-series comparison
- Change scoring
- Structured result generation

The backend does **NOT**: - Perform medical diagnosis - Expose
embeddings - Return internal ML representations

---

# Authentication

All endpoints require a valid Supabase JWT.

- Frontend sends: Authorization: Bearer `<jwt_token>`{=html}

- Backend validates JWT internally using Supabase public key.

- No `/api/auth/verify` endpoint exists.

If JWT invalid → return 401.

---

# Endpoints

## Analyze Session

POST /api/analyze-session/{session_id}

Purpose:

- Preprocess images
- Compute per-angle variation
- Compute overall session change score
- Store results
- Return structured response

Response:

{ "success": true, "data": { "session_id": "uuid", "session_analysis": {
"per_angle": \[ { "angle": "front", "variation_score": 0.12, "summary":
"Minor visual variation detected" } \], "overall_variation_score": 0.10,
"summary": "No significant shift detected" }, "scores": {
"change_score": 0.23, "confidence": 0.85 } } }

Notes:

- Embeddings are never returned.
- Scores are normalized 0.0 -- 1.0.
- Language must remain neutral.

---

## Compare Sessions

POST /api/compare-sessions/{current}/{previous}

Purpose:

- Compare current vs previous sessions
- Compute trend direction, stability index, and delta magnitude
- Return structured comparison response

Response:

{ "success": true, "data": { "vs_last_session": {}, "vs_last_5": {},
"vs_last_month": {}, "overall_trend": "stable" } }

---

## Generate Report

POST /api/generate-report/{session_id}

Purpose:

- Build a structured report from stored analysis
- Return a shareable report payload (no medical claims)

---

# Database Structure (Phase 2)

## session_analysis

session_id UUID PRIMARY KEY user_id UUID overall_variation_score FLOAT
summary TEXT created_at TIMESTAMP

## angle_analysis

id UUID PRIMARY KEY session_id UUID angle_type TEXT variation_score
FLOAT summary TEXT created_at TIMESTAMP

Optional future:

## session_embeddings (internal only)

session_id UUID embedding VECTOR

Embeddings must never be exposed in API responses.

---

# Error Handling

Standard format:

{ "success": false, "error": { "code": "INVALID_SESSION", "message":
"Session not found or unauthorized", "status": 404 } }

Common Status Codes:

200 Success\
400 Bad request\
401 Unauthorized\
403 Forbidden\
404 Not found\
500 Server error

---

# Rate Limiting

Recommended limits (per user):

- 20 session processing calls per day
- 200 analysis fetches per day

---

# Environment Variables

Frontend (.env.local)

VITE_API_URL=http://localhost:8000

Backend (.env)

SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_PUBLIC_KEY=... API_PORT=8000

---

# Phase 2 Execution Order

1.  Implement JWT validation middleware
2.  Implement `/api/analyze-session/{session_id}` (placeholder scoring)
3.  Implement `/api/compare-sessions/{current}/{previous}`
4.  Store results in structured tables
5.  Integrate frontend
6.  Replace placeholder scoring with real ML pipeline

---

# Engineering Principles

- Deterministic processing
- Stateless endpoints
- No frontend business logic
- No medical claims
- No exposure of embeddings
- Clear separation of preprocessing, scoring, and comparison

---

End of Phase 2 API Contract.
