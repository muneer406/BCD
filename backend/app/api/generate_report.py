from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies import get_current_user
from ..services.report_service import generate_report as build_report
from ..services.session_service import get_session

router = APIRouter(tags=["reports"])


@router.post("/generate-report/{session_id}")
def generate_report(session_id: str, user=Depends(get_current_user)):
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

    report = build_report(session_id, user_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not available for this session",
        )

    return {
        "success": True,
        "data": report,
    }
