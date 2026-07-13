---
title: BCD Backend
emoji: 🩺
colorFrom: indigo
colorTo: blue
sdk: docker
sdk_version: "1.0"
python_version: "3.11"
app_file: app/main.py
pinned: false
---

# BCD Backend

FastAPI + PyTorch + OpenCV backend for the BCD (Breast Changes Detection) app.

## Quick Start

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env        # Add your values
uvicorn app.main:app --reload  # → http://localhost:8000
```

## Documentation

**Full comprehensive documentation:** [`BACKEND_DOCS.md`](BACKEND_DOCS.md) (985 lines)

Covers:
- Complete API reference with request/response schemas
- ML pipeline architecture (EfficientNetV2-S embeddings)
- Image preprocessing (CLAHE, denoise, torso crop, sharpening)
- Environment variables and configuration
- Deployment (Docker, HF Spaces)
- Database schema and migrations
- Testing guide

## Key Features

- **ML Pipeline:** EfficientNetV2-S 1280-dim embeddings for change detection
- **Image Processing:** 8-step preprocessing (EXIF → denoise → CLAHE → crop → resize → sharpen)
- **Comparison:** 5-layer session comparison (immediate, rolling, monthly, lifetime, per-angle)
- **Quality Scoring:** Blur detection, brightness assessment, confidence scoring
- **Security:** JWT verification via JWKS, rate limiting, CSP headers, input validation
