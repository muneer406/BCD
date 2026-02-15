from typing import List

from .db import get_supabase_client


def get_session_images(session_id: str, user_id: str) -> List[dict]:
    supabase = get_supabase_client()
    result = (
        supabase.table("images")
        .select("id, image_type, storage_path, created_at")
        .eq("session_id", session_id)
        .eq("user_id", user_id)
        .execute()
    )

    return result.data or []
