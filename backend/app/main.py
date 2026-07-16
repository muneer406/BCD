import logging
import logging.config

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.analyze_session import router as analyze_router
from .api.analyze_status import router as analyze_status_router
from .api.compare_sessions import router as compare_router
from .api.generate_report import router as report_router
from .api.session_analysis import router as session_analysis_router
from .api.utility import router as utility_router
from .api.delete_session import router as delete_session_router
from .config import get_settings
from .limiter import limiter as _shared_limiter

# ---------------------------------------------------------------------------
# Logging configuration (Phase 5 Part 8)
# ---------------------------------------------------------------------------

# Download ONNX model from GitHub Releases at startup
import urllib.request, os
_model_path = os.path.join(os.path.dirname(__file__), "models", "mobilenetv3_small_embedding_int8.onnx")
if not os.path.exists(_model_path) or os.path.getsize(_model_path) < 1000000:
    os.makedirs(os.path.dirname(_model_path), exist_ok=True)
    try:
        _url = "https://github.com/muneer406/BCD/releases/download/v0.1.0-models/mobilenetv3_small_embedding_int8.onnx"
        urllib.request.urlretrieve(_url, _model_path)
    except Exception:
        pass  # Non-fatal — model check happens later in embedding module

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            "datefmt": "%Y-%m-%dT%H:%M:%S",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "stream": "ext://sys.stdout",
        },
    },
    "root": {"level": "INFO", "handlers": ["console"]},
    "loggers": {
        "app": {"level": "INFO", "propagate": True},
        "uvicorn.access": {"level": "WARNING"},
    },
}

logging.config.dictConfig(LOGGING_CONFIG)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiting (Phase 5 Part 8)
# ---------------------------------------------------------------------------

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address

    limiter = _shared_limiter
    _slowapi_available = True
except ImportError:
    limiter = None
    _slowapi_available = False
    logger.warning(
        "slowapi not installed; rate limiting disabled. "
        "Run: pip install slowapi==0.1.9"
    )

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

settings = get_settings()

# Warn if CORS origins are not properly configured
if not settings.allowed_origins.strip() or settings.allowed_origins.strip() == "*":
    logger.warning(
        "ALLOWED_ORIGINS is empty or set to '*' — CORS is permissive. "
        "Set ALLOWED_ORIGINS to specific origins in production."
    )

app = FastAPI(
    title="BCD Backend",
    version="0.2.0",
    openapi_url=f"{settings.api_prefix}/openapi.json",
    docs_url=f"{settings.api_prefix}/docs",
)

# Rate limiting middleware
if _slowapi_available and limiter is not None:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

_raw_origins = settings.allowed_origins.strip()
if _raw_origins == "*":
    allow_origins = ["*"]
    allow_credentials = False
else:
    allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Content-Security-Policy header
# ---------------------------------------------------------------------------

@app.middleware("http")
async def add_csp_and_cors(request: Request, call_next):
    response = await call_next(request)
    # Allow all origins for API responses (CORS)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    # Content-Security-Policy
    csp_connect = (
        "connect-src 'self' "
        "http://localhost:8000 ws://localhost:8000 "
        "https://vtpgeaqhkbbpvaigxwgq.supabase.co "
        "https://o4510489331236864.ingest.us.sentry.io "
        "https://*.hf.space "
        "https://*.vercel.app"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'none'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        f"{csp_connect}; "
        "worker-src blob:; "
        "frame-src 'none'; "
        "object-src 'none'"
    )
    return response

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(analyze_router, prefix=settings.api_prefix)
app.include_router(analyze_status_router, prefix=settings.api_prefix)
app.include_router(compare_router, prefix=settings.api_prefix)
app.include_router(report_router, prefix=settings.api_prefix)
app.include_router(session_analysis_router, prefix=settings.api_prefix)
app.include_router(utility_router, prefix=settings.api_prefix)
app.include_router(delete_session_router, prefix=settings.api_prefix)


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "Unhandled exception on %s %s", request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected error occurred. Please try again later.",
        },
    )


# ---------------------------------------------------------------------------
# Health checks
# ---------------------------------------------------------------------------

@app.get("/")
def health_check():
    return {"status": "ok"}


@app.get("/health")
def health_check_named():
    return {"status": "ok"}
