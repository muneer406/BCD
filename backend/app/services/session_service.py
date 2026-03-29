from typing import Any, Dict

from .db import get_supabase_client


def count_user_sessions(user_id: str) -> int:
    """Total sessions for this user (all statuses), for interpretation context."""
    supabase = get_supabase_client()
    count_response = (
        supabase.table("sessions")
        .select("id", count="exact", head=True)
        .eq("user_id", user_id)
        .execute()
    )
    return int(count_response.count or 0)


def get_session(session_id: str, user_id: str) -> Dict[str, Any]:
    supabase = get_supabase_client()
    result = (
        supabase.table("sessions")
        .select("id, user_id, status, created_at")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .execute()
    )

    rows = result.data or []
    if not rows:
        return {}

    return rows[0]
