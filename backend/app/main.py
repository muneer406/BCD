from fastapi import FastAPI

from .api.analyze_session import router as analyze_router
from .api.compare_sessions import router as compare_router
from .api.generate_report import router as report_router
from .config import get_settings


settings = get_settings()

app = FastAPI(
    title="BCD Backend",
    version="0.1.0",
    openapi_url=f"{settings.api_prefix}/openapi.json",
    docs_url=f"{settings.api_prefix}/docs",
)

app.include_router(analyze_router, prefix=settings.api_prefix)
app.include_router(compare_router, prefix=settings.api_prefix)
app.include_router(report_router, prefix=settings.api_prefix)


@app.get("/")
def health_check():
    return {"status": "ok"}
