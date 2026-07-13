import os
from dataclasses import dataclass
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


@dataclass(frozen=True)
class Settings:
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    # supabase_jwt_public_key was removed in favor of JWKS-based verification
    supabase_jwks_url: str = os.getenv("SUPABASE_JWKS_URL", "")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "ES256")
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8000"))
    api_prefix: str = os.getenv("API_PREFIX", "/api")
    # Phase 5: CORS and rate limiting
    # Comma-separated list of allowed origins, or "*" for development.
    # Example: "https://app.example.com,https://staging.example.com"
    allowed_origins: str = os.getenv("ALLOWED_ORIGINS", "")
    # Max analysis requests per day per user (0 = unlimited)
    rate_limit_analysis_per_day: int = int(
        os.getenv("RATE_LIMIT_ANALYSIS_PER_DAY", "20"))
    # Phase 7: Magic link backdoor password — if empty, the /api/generateLink
    # endpoint is disabled (503). Set BACKDOOR_PASSWORD in .env to enable.
    backdoor_password: str = os.getenv("BACKDOOR_PASSWORD", "")


def get_settings() -> Settings:
    settings = Settings()
    if not settings.supabase_jwks_url and settings.supabase_url:
        jwks_url = settings.supabase_url.rstrip(
            "/") + "/auth/v1/.well-known/jwks.json"
        return Settings(
            supabase_url=settings.supabase_url,
            supabase_service_role_key=settings.supabase_service_role_key,
            supabase_jwks_url=jwks_url,
            jwt_algorithm=settings.jwt_algorithm,
            api_host=settings.api_host,
            api_port=settings.api_port,
            api_prefix=settings.api_prefix,
            allowed_origins=settings.allowed_origins,
            rate_limit_analysis_per_day=settings.rate_limit_analysis_per_day,
            backdoor_password=settings.backdoor_password,
        )
    return settings
