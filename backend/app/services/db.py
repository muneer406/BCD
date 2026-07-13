"""
BCD Backend - Supabase client factory with connection caching.
Reuses the same client instance across calls to avoid TCP overhead.
"""
from typing import Optional
from supabase import Client, create_client

from ..config import get_settings

_client_cache: Optional[Client] = None


def get_supabase_client() -> Client:
    """
    Return a reusable Supabase client instance.
    The client is created once and cached at module level.
    Uses service role key — never expose this to the frontend.
    """
    global _client_cache
    if _client_cache is None:
        settings = get_settings()
        _client_cache = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _client_cache


def reset_client():
    """
    Force client re-creation on next call. Useful after configuration changes.
    """
    global _client_cache
    _client_cache = None
