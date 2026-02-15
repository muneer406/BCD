import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    supabase_jwt_public_key: str = os.getenv("SUPABASE_JWT_PUBLIC_KEY", "")
    supabase_jwks_url: str = os.getenv("SUPABASE_JWKS_URL", "")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "RS256")
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8000"))
    api_prefix: str = os.getenv("API_PREFIX", "/api")


def get_settings() -> Settings:
    settings = Settings()
    if not settings.supabase_jwks_url and settings.supabase_url:
        jwks_url = settings.supabase_url.rstrip(
            "/") + "/auth/v1/.well-known/jwks.json"
        return Settings(
            supabase_url=settings.supabase_url,
            supabase_service_role_key=settings.supabase_service_role_key,
            supabase_jwt_public_key=settings.supabase_jwt_public_key,
            supabase_jwks_url=jwks_url,
            jwt_algorithm=settings.jwt_algorithm,
            api_host=settings.api_host,
            api_port=settings.api_port,
            api_prefix=settings.api_prefix,
        )
    return settings
