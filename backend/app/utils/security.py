from typing import Dict

import requests
from jose import JWTError, jwk, jwt


def _load_jwks(jwks_url: str) -> dict:
    response = requests.get(jwks_url, timeout=5)
    response.raise_for_status()
    return response.json()


def decode_supabase_jwt(token: str, jwks_url: str, algorithm: str) -> Dict[str, str]:
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise ValueError("Invalid JWT header") from exc

    kid = header.get("kid")
    if not kid:
        raise ValueError("JWT missing key id")

    jwks = _load_jwks(jwks_url)
    keys = jwks.get("keys", [])
    key_data = next((key for key in keys if key.get("kid") == kid), None)
    if not key_data:
        raise ValueError("JWT key not found in JWKS")

    try:
        key = jwk.construct(key_data)
        payload = jwt.decode(token, key.to_pem().decode(
            "utf-8"), algorithms=[algorithm])
    except JWTError as exc:
        raise ValueError("Invalid JWT token") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("JWT missing subject")

    return {
        "user_id": user_id,
        "role": payload.get("role", ""),
        "email": payload.get("email", ""),
    }
