from typing import Dict

import jwt
import requests
from jwt import PyJWK

# In-memory JWKS cache: { url: (keys_list, fetched_at_epoch) }
_jwks_cache: Dict[str, tuple] = {}
_JWKS_TTL_SECONDS = 3600  # Re-fetch at most once per hour


def _get_jwks(jwks_url: str) -> list:
    """Fetch JWKS with in-memory caching to avoid hitting Supabase on every request."""
    import time
    cached = _jwks_cache.get(jwks_url)
    if cached:
        keys, fetched_at = cached
        if time.time() - fetched_at < _JWKS_TTL_SECONDS:
            return keys

    response = requests.get(jwks_url, timeout=5)
    response.raise_for_status()
    keys = response.json().get("keys", [])
    _jwks_cache[jwks_url] = (keys, time.time())
    print(f"[JWT] Fetched and cached JWKS ({len(keys)} keys) from: {jwks_url}")
    return keys


def decode_supabase_jwt(token: str, jwks_url: str, algorithm: str) -> Dict[str, str]:
    """
    Decode and verify a Supabase JWT token using JWKS.
    """
    try:
        # Get the unverified header to find the key ID
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        if not kid:
            raise ValueError("JWT missing key id")

        # Get keys (cached)
        keys = _get_jwks(jwks_url)

        # Find the matching key
        key_data = next((key for key in keys if key.get("kid") == kid), None)

        if not key_data:
            # Cache miss for kid — force refresh once
            _jwks_cache.pop(jwks_url, None)
            keys = _get_jwks(jwks_url)
            key_data = next(
                (key for key in keys if key.get("kid") == kid), None)
            if not key_data:
                raise ValueError(f"JWT key {kid} not found in JWKS")

        # Use PyJWT's JWK support to construct the signing key
        key = PyJWK(key_data).key

        # Decode and verify token
        payload = jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            audience="authenticated"
        )

        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("JWT missing subject")

        return {
            "user_id": user_id,
            "role": payload.get("role", ""),
            "email": payload.get("email", ""),
        }

    except jwt.InvalidTokenError as exc:
        raise ValueError(f"Invalid JWT token: {exc}") from exc
    except Exception as exc:
        raise ValueError(f"JWT verification failed: {exc}") from exc
