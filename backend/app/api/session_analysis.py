from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies import get_current_user
from ..services.analysis_fetch_service import get_session_analysis
from ..services.session_service import get_session

router = APIRouter(tags=["analysis"])


@router.get("/sessions/{session_id}/analysis")
def fetch_session_analysis(session_id: str, user=Depends(get_current_user)):
    user_id = user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user context",
        )

    session = get_session(session_id, user_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    analysis = get_session_analysis(session_id, user_id)
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not available for this session",
        )

    return {
        "success": True,
        "data": {
            "session_analysis": analysis,
        },
    }
