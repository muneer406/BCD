"""
BCD Backend - Supabase client factory with connection caching.
Reuses the same client instance across calls to avoid TCP overhead.
"""
from typing import Optional

import httpx
from supabase import Client, create_client

from ..config import get_settings

_client_cache: Optional[Client] = None

# The Supabase Python SDK builds on httpx, but does not expose the underlying
# http_client directly. We therefore keep a dedicated, timed-out httpx client
# for storage downloads and configure the Supabase client with the same timeout
# policy when newer SDK versions support it.
_http_client: Optional[httpx.Client] = None

# Shared timeout policy: 10 s to establish a connection, 30 s to read a response.
DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=10.0, read=30.0)


def get_http_client() -> httpx.Client:
    """Return a reusable httpx client configured with explicit timeouts."""
    global _http_client
    if _http_client is None:
        _http_client = httpx.Client(timeout=DEFAULT_TIMEOUT)
    return _http_client


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
