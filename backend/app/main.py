from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.analyze_session import router as analyze_router
from .api.compare_sessions import router as compare_router
from .api.generate_report import router as report_router
from .api.session_analysis import router as session_analysis_router
from .api.utility import router as utility_router
from .config import get_settings


settings = get_settings()

app = FastAPI(
    title="BCD Backend",
    version="0.1.0",
    openapi_url=f"{settings.api_prefix}/openapi.json",
    docs_url=f"{settings.api_prefix}/docs",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

app.include_router(analyze_router, prefix=settings.api_prefix)
app.include_router(compare_router, prefix=settings.api_prefix)
app.include_router(report_router, prefix=settings.api_prefix)
app.include_router(session_analysis_router, prefix=settings.api_prefix)
app.include_router(utility_router, prefix=settings.api_prefix)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all for unhandled exceptions so that FastAPI (not Starlette's
    ServerErrorMiddleware) generates the 500 response.  This keeps the response
    inside the CORS middleware stack and ensures the appropriate
    Access-Control-Allow-Origin header is always present on error responses.
    """
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Internal server error: {type(exc).__name__}: {exc}"},
    )


@app.get("/")
def health_check():
    return {"status": "ok"}
