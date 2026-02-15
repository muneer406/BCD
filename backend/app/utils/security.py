from typing import Dict

from jose import JWTError, jwt


def decode_supabase_jwt(token: str, public_key: str, algorithm: str) -> Dict[str, str]:
    try:
        payload = jwt.decode(token, public_key, algorithms=[algorithm])
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
