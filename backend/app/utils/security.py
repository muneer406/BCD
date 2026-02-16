from typing import Dict

import requests
from jose import JWTError, jwk, jwt


def _load_jwks(jwks_url: str) -> dict:
    response = requests.get(jwks_url, timeout=5)
    response.raise_for_status()
    return response.json()


def decode_supabase_jwt(token: str, jwks_url: str, algorithm: str) -> Dict[str, str]:
    print(f"\n{'='*80}")
    print(f"DEBUG: JWT Validation Starting")
    print(f"JWKS URL: {jwks_url}")
    print(f"Algorithm: {algorithm}")
    print(f"{'='*80}\n")

    try:
        header = jwt.get_unverified_header(token)
        print(f"DEBUG: JWT Header: {header}")
    except JWTError as exc:
        print(f"DEBUG: Failed to parse JWT header: {exc}")
        raise ValueError("Invalid JWT header") from exc

    kid = header.get("kid")
    if not kid:
        print(f"DEBUG: JWT missing kid in header")
        raise ValueError("JWT missing key id")

    print(f"DEBUG: Looking for kid: {kid}")

    try:
        jwks = _load_jwks(jwks_url)
        print(f"DEBUG: Loaded JWKS with {len(jwks.get('keys', []))} keys")
    except Exception as exc:
        print(f"DEBUG: Failed to load JWKS: {exc}")
        raise ValueError(f"Failed to fetch JWKS: {exc}") from exc

    keys = jwks.get("keys", [])
    key_data = next((key for key in keys if key.get("kid") == kid), None)
    if not key_data:
        print(f"DEBUG: Available kids: {[k.get('kid') for k in keys]}")
        raise ValueError("JWT key not found in JWKS")

    print(f"DEBUG: Found matching key, attempting decode...")

    try:
        key = jwk.construct(key_data)
        payload = jwt.decode(
            token,
            key.to_pem().decode("utf-8"),
            algorithms=[algorithm],
            audience="authenticated"  # Supabase JWTs have aud: "authenticated"
        )
        print(
            f"DEBUG: JWT decoded successfully, user_id: {payload.get('sub')}")
    except JWTError as exc:
        print(f"DEBUG: JWT decode failed: {type(exc).__name__}: {exc}")
        raise ValueError(f"Invalid JWT token: {exc}") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("JWT missing subject")

    return {
        "user_id": user_id,
        "role": payload.get("role", ""),
        "email": payload.get("email", ""),
    }
