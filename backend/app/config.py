import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    supabase_jwt_public_key: str = os.getenv("SUPABASE_JWT_PUBLIC_KEY", "")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "RS256")
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8000"))
    api_prefix: str = os.getenv("API_PREFIX", "/api")


def get_settings() -> Settings:
    return Settings()
