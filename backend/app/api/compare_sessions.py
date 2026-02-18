from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies import get_current_user
from ..services.comparison_service import compare_sessions as run_comparison
from ..services.session_service import get_session

router = APIRouter(tags=["comparison"])


@router.post("/compare-sessions/{current_session_id}/{previous_session_id}")
def compare_sessions(
    current_session_id: str,
    previous_session_id: str,
    user=Depends(get_current_user),
):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user context",
        )

    if current_session_id == previous_session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current and previous session IDs must differ",
        )

    current_session = get_session(current_session_id, user_id)
    previous_session = get_session(previous_session_id, user_id)

    if not current_session or not previous_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if current_session.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current session is not completed",
        )

    if previous_session.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Previous session is not completed",
        )

    try:
        comparison = run_comparison(current_session_id, previous_session_id, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return {
        "success": True,
        "data": comparison,
    }
