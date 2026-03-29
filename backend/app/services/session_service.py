from typing import Any, Dict, Optional

from .db import get_supabase_client


def get_previous_session_id(user_id: str, current_session_id: str) -> Optional[str]:
    """
    Return the chronologically prior completed session for this user
    (the session captured just before the current one).
    """
    supabase = get_supabase_client()
    result = (
        supabase.table("sessions")
        .select("id")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    ids = [row["id"] for row in (result.data or [])]
    try:
        idx = ids.index(current_session_id)
    except ValueError:
        return None
    if idx + 1 < len(ids):
        return ids[idx + 1]
    return None


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
