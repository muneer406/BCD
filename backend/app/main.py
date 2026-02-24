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
from .config import get_settings
from .limiter import limiter as _shared_limiter

# ---------------------------------------------------------------------------
# Logging configuration (Phase 5 Part 8)
# ---------------------------------------------------------------------------

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
        "uvicorn.access": {"level": "WARNING"},   # suppress per-request noise
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
    # slowapi not installed yet — continue without rate limiting
    limiter = None  # type: ignore[assignment]
    _slowapi_available = False
    logger.warning(
        "slowapi not installed; rate limiting disabled. "
        "Run: pip install slowapi==0.1.9"
    )

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

settings = get_settings()

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
# CORS (Phase 5 Part 8 — restrict to configured origins in production)
# ---------------------------------------------------------------------------

# ALLOWED_ORIGINS env var: comma-separated list or "*" for dev.
# Example: ALLOWED_ORIGINS="https://app.example.com"
_raw_origins = settings.allowed_origins.strip()
if _raw_origins == "*":
    allow_origins = ["*"]
    allow_credentials = False   # credentials + wildcard not allowed by spec
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
# Routers
# ---------------------------------------------------------------------------

app.include_router(analyze_router, prefix=settings.api_prefix)
app.include_router(analyze_status_router, prefix=settings.api_prefix)
app.include_router(compare_router, prefix=settings.api_prefix)
app.include_router(report_router, prefix=settings.api_prefix)
app.include_router(session_analysis_router, prefix=settings.api_prefix)
app.include_router(utility_router, prefix=settings.api_prefix)


# ---------------------------------------------------------------------------
# Global exception handler (keeps CORS headers present on 500 responses)
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all for unhandled exceptions so that FastAPI (not Starlette's
    ServerErrorMiddleware) generates the 500 response.  This keeps the response
    inside the CORS middleware stack and ensures Access-Control-Allow-Origin
    is always present on error responses.
    """
    logger.exception(
        "Unhandled exception on %s %s", request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Internal server error: {type(exc).__name__}: {exc}"},
    )


# ---------------------------------------------------------------------------
# Health checks
# ---------------------------------------------------------------------------

@app.get("/")
def health_check():
    return {"status": "ok"}


@app.get("/health")
def health_check_named():
    """Explicit /health endpoint for load-balancers, uptime monitors, and HF Spaces."""
    return {"status": "ok"}
