"""Shared input validation helpers for API route handlers."""
import re
from typing import Optional

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
VALID_IMAGE_TYPES = {"front", "left", "right", "up", "down", "raised"}

def validate_session_id(session_id: str, field_name: str = "session_id") -> Optional[str]:
    if not session_id or not isinstance(session_id, str):
        return f"{field_name} must be a non-empty string"
    if not UUID_PATTERN.match(session_id):
        return f"{field_name} must be a valid UUID"
    return None

def validate_image_type(image_type: str) -> Optional[str]:
    if not image_type or not isinstance(image_type, str):
        return "image_type must be a non-empty string"
    if image_type not in VALID_IMAGE_TYPES:
        valid = ", ".join(sorted(VALID_IMAGE_TYPES))
        return f"image_type must be one of: {valid} (got: {image_type})"
    return None