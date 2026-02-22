---
title: BCD Backend API
emoji: 🔬
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# BCD Backend API

FastAPI backend for the Body Composition Detection (BCD) Visual Anomaly Awareness System.

## Environment Variables

Set these as **Secrets** in your Hugging Face Space settings (Settings → Variables and Secrets):

| Secret                        | Description                                                 |
| ----------------------------- | ----------------------------------------------------------- |
| `SUPABASE_URL`                | `https://<project-ref>.supabase.co`                         |
| `SUPABASE_SERVICE_ROLE_KEY`   | Supabase → Project Settings → API → service_role key        |
| `JWT_ALGORITHM`               | `ES256` (Supabase default)                                  |
| `ALLOWED_ORIGINS`             | Your Vercel frontend URL, e.g. `https://bcd-app.vercel.app` |
| `RATE_LIMIT_ANALYSIS_PER_DAY` | `20` (optional, default 20)                                 |

> `SUPABASE_JWKS_URL` is auto-derived from `SUPABASE_URL` — no need to set it manually.

## Health Check

```
GET /
→ {"status": "ok"}
```

## Local Development (Docker)

```bash
# In the backend/ directory
cp .env.example .env        # fill in your secrets
docker compose up --build
# API available at http://localhost:8000
```

## Notes

- Port **7860** is required by Hugging Face Spaces Docker SDK.
- First cold start takes ~20–30 s while PyTorch loads EfficientNetV2-S.
- CPU-only PyTorch is used (no GPU needed for inference).
- Minimum RAM: **1 GB** (PyTorch + model ~600 MB).
