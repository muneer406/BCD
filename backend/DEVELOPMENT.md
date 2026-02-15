# Backend Development Guide

This guide covers setup and development for the BCD backend (Phase 2).

---

## Overview

The backend will handle:

- **Image Processing**: Load and preprocess images
- **ML Anomaly Detection**: Analyze visual changes
- **Session Comparison**: Compare current vs historical sessions
- **Scoring**: Calculate change scores and confidence metrics
- **Report Generation**: Create shareable PDF reports

---

## Architecture

### Technology Stack

- **Framework**: FastAPI (Python async web framework)
- **ML**: PyTorch / TensorFlow for embeddings
- **Database**: PostgreSQL (via Supabase)
- **Storage**: Supabase Storage (S3-compatible)
- **Deployment**: Cloud Run or Railway
- **Async Processing**: Celery with Redis (for large batches)

### Service Diagram

```
Frontend (React)
    ↓ HTTPS
FastAPI Backend
    ├── /api/auth/* (token validation)
    ├── /api/analyze/* (image processing)
    ├── /api/compare/* (session comparison)
    └── /api/reports/* (report generation)
    ↓
Supabase (PostgreSQL + Storage)
    ├── Load images via signed URLs
    ├── Save analysis results
    └── Store embeddings (future)
    ↓
ML Models
    ├── Image encoder (CNN)
    ├── Anomaly detector
    └── Change classifier
```

---

## Project Setup

### Prerequisites

- **Python** 3.10+
- **pip** or **Poetry** for dependency management
- **PostgreSQL** client (optional, for local testing)
- **Git**

### Initial Setup

```bash
# Navigate to backend directory
cd BCD/backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# Install dependencies (will be specified after module selection)
pip install fastapi uvicorn supabase-py pydantic python-dotenv
```

### Environment Configuration

Create `.env` file in `backend/` directory:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# FastAPI
DEBUG=True
API_HOST=0.0.0.0
API_PORT=8000
API_PREFIX=/api

# JWT
JWT_ALGORITHM=HS256
JWT_SECRET_KEY=your-secret-key-here

# ML Models
MODEL_PATH=./models
CACHE_DIR=./cache
```

**⚠️ Important**: Never commit `.env` to Git!

---

## Planned Directory Structure

```
backend/
├── app/
│  ├── __init__.py
│  ├── main.py              # FastAPI app initialization
│  ├── config.py            # Settings & env variables
│  ├── dependencies.py      # Dependency injection
│  │
│  ├── api/
│  │  ├── __init__.py
│  │  ├── auth.py           # Token validation
│  │  ├── sessions.py       # Session endpoints
│  │  ├── analysis.py       # Image analysis endpoints
│  │  ├── comparison.py     # Session comparison endpoints
│  │  └── reports.py        # Report generation endpoints
│  │
│  ├── models/              # Pydantic models
│  │  ├── __init__.py
│  │  ├── session.py        # Session schemas
│  │  ├── image.py          # Image schemas
│  │  ├── analysis.py       # Analysis result schemas
│  │  └── error.py          # Error response schemas
│  │
│  ├── services/            # Business logic
│  │  ├── __init__.py
│  │  ├── db.py             # Database operations
│  │  ├── storage.py        # Image loading/storage
│  │  ├── ml.py             # ML model wrapper
│  │  ├── analysis.py       # Image analysis logic
│  │  ├── comparison.py     # Comparison logic
│  │  └── reports.py        # Report generation
│  │
│  ├── ml/                  # ML models
│  │  ├── __init__.py
│  │  ├── encoder.py        # Image encoder
│  │  ├── detector.py       # Anomaly detector
│  │  └── classifier.py     # Change classifier
│  │
│  └── utils/               # Utilities
│     ├── __init__.py
│     ├── logger.py         # Logging setup
│     ├── security.py       # JWT validation
│     └── validators.py     # Input validation
│
├── tests/                  # Unit tests
│  ├── __init__.py
│  ├── conftest.py
│  ├── test_api.py
│  ├── test_services.py
│  └── test_ml.py
│
├── .env.example            # Template environment file
├── requirements.txt        # Python dependencies
├── Dockerfile              # Container image
├── docker-compose.yml      # Local dev environment
├── DEVELOPMENT.md          # This file
└── README.md               # Backend overview
```

---

## Development Workflow

### Starting Development Server

```bash
# Activate virtual environment
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install/update dependencies
pip install -r requirements.txt

# Start server (with auto-reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Server runs at `http://localhost:8000`

API docs at `http://localhost:8000/docs` (Swagger UI)

### Hot Reload

FastAPI with Uvicorn supports hot reload in development:

- Changes to `.py` files trigger automatic server restart
- API docs update in real-time

---

## API Endpoints (Planned)

### Authentication

```http
POST /api/auth/verify
- Input: token (JWT from frontend)
- Output: { user_id, email, valid }
```

### Session Analysis

```http
POST /api/analyze/session/{session_id}
- Loads all 6 images from Supabase Storage
- Extracts embeddings and features
- Detects anomalies
- Output: {
    session_analysis: {
      per_angle: [
        {
          angle: "front",
          embedding: [...],
          quality_score: 0.95,
          observations: "..."
        }
      ],
      overall_summary: "..."
    }
  }
```

### Session Comparison

```http
POST /api/compare/sessions
- Input: {
    current_session_id,
    previous_session_id
  }
- Output: {
    per_angle_comparison: [
      {
        angle: "front",
        change_magnitude: 0.15,
        change_direction: "increase|decrease|stable",
        observation: "..."
      }
    ],
    overall_change: 0.12,
    recommendation: "..."
  }
```

### Trend Analysis

```http
GET /api/trends/{session_id}
- Compares to last 5, last 30 days, all time
- Output: {
    trends: [
      {
        angle: "front",
        history: [0.1, 0.15, 0.12, 0.18],
        direction: "increasing",
        volatility: "low"
      }
    ]
  }
```

### Report Generation

```http
GET /api/reports/{session_id}/pdf
- Generates PDF with comparisons and analysis
- Output: PDF binary
```

---

## Database Operations

### Connecting to Supabase

```python
from supabase import create_client, Client

supabase: Client = create_client(
    url=os.getenv("SUPABASE_URL"),
    key=os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)

# Query sessions
sessions = supabase.table("sessions").select("*").eq("user_id", user_id).execute()

# Insert analysis results
supabase.table("analysis_results").insert({
    "session_id": session_id,
    "user_id": user_id,
    "per_angle_results": results,
    "overall_summary": summary
}).execute()
```

### Storing Embeddings (Future)

For faster comparisons, embeddings can be stored:

```python
# Add embeddings table
CREATE TABLE embeddings (
  id UUID PRIMARY KEY,
  image_id UUID REFERENCES images(id),
  embedding VECTOR(512),  -- if using pgvector
  created_at TIMESTAMP
);

# Store after analysis
supabase.table("embeddings").insert({
    "image_id": image_id,
    "embedding": embedding_vector
}).execute()

# Query similar images
# Using pgvector similarity search
```

---

## ML Model Workflow

### Phase 1: Placeholder Implementation

For initial backend development, use placeholder/mock models:

```python
def analyze_image(image_path: str) -> dict:
    """Placeholder analysis"""
    return {
        "quality_score": 0.85,
        "anomaly_score": 0.2,
        "embedding": [0.1] * 512,  # Mock embedding
        "observations": "Sample observation"
    }

def compare_embeddings(emb1: list, emb2: list) -> float:
    """Placeholder comparison"""
    from scipy.spatial.distance import cosine
    return 1 - cosine(emb1, emb2)
```

### Phase 2: Real Model Integration

Later, integrate real ML models:

```python
# Example: CLIP for visual features
from transformers import CLIPProcessor, CLIPModel

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

def get_image_embedding(image_path):
    image = Image.open(image_path)
    inputs = processor(images=image, return_tensors="pt")
    outputs = model.get_image_features(**inputs)
    return outputs.detach().numpy()
```

---

## Testing

### Unit Tests

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/test_api.py

# Run with coverage
pytest --cov=app
```

### Manual Testing

Use provided REST client or curl:

```bash
# Verify API is running
curl http://localhost:8000/docs

# Test analyze endpoint
curl -X POST http://localhost:8000/api/analyze/session/123-session-id \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

## Code Style & Standards

### Python Style Guide

Follow PEP 8:

```bash
# Check style
flake8 app/

# Auto-format
black app/
```

### Type Hints

```python
from typing import Optional, List
from pydantic import BaseModel

class SessionAnalysis(BaseModel):
    session_id: str
    per_angle_results: List[dict]
    overall_summary: str
    created_at: Optional[str] = None
```

### Error Handling

```python
from fastapi import HTTPException, status

@app.post("/api/analyze/{session_id}")
async def analyze_session(session_id: str):
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="session_id required"
        )

    try:
        results = await process_images(session_id)
        return {"success": True, "data": results}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
```

---

## Deployment

### Production Configuration

1. **Environment variables**: Set all `.env` variables in production
2. **Database**: Use service role key (more restricted in production)
3. **CORS**: Configure allowed origins
4. **Logging**: Use structured logging for monitoring

### Docker Deployment

```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
# Build
docker build -t bcd-backend .

# Run
docker run -p 8000:8000 --env-file .env bcd-backend
```

### Cloud Run Deployment

```bash
gcloud run deploy bcd-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --set-env-vars SUPABASE_URL=xxx,SUPABASE_SERVICE_ROLE_KEY=xxx
```

---

## Dependencies (Planned)

```
# Web framework
fastapi==0.104.0
uvicorn==0.24.0
pydantic==2.4.0

# Database
supabase==2.0.0
psycopg2-binary==2.9.0

# ML/Data science
torch==2.0.0
torchvision==0.15.0
numpy==1.24.0
pillow==10.0.0
scipy==1.11.0

# Utilities
python-dotenv==1.0.0
python-jwt==1.3.0
aiofiles==23.2.0

# Testing
pytest==7.4.0
pytest-asyncio==0.21.0
pytest-cov==4.1.0

# Code quality
black==23.10.0
flake8==6.1.0
mypy==1.6.0
```

---

## Common Issues

### ModuleNotFoundError

**Problem**: `No module named 'app'`

**Solution**:

```bash
# Ensure virtual environment is activated
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Supabase Connection

**Problem**: Can't connect to Supabase

**Solution**:

1. Verify `.env` variables
2. Check network connectivity
3. Validate service role key permissions

### Image Upload Failures

**Problem**: Can't load images from storage

**Solution**:

1. Verify signed URLs are not expired
2. Check storage path matches database
3. Ensure RLS policies allow backend access

---

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Supabase Python SDK](https://supabase.com/docs/reference/python/introduction)
- [PyTorch Documentation](https://pytorch.org/docs/)
- [Python Best Practices](https://pep8.org/)

---

## Next Steps

1. Set up project structure
2. Implement auth verification endpoint
3. Create session analysis endpoint with placeholders
4. Integrate with Supabase
5. Add ML model integration
6. Deploy to Cloud Run
