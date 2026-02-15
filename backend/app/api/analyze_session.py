from fastapi import APIRouter, Depends

from ..dependencies import get_current_user

router = APIRouter(tags=["analysis"])


@router.post("/analyze-session/{session_id}")
def analyze_session(session_id: str, user=Depends(get_current_user)):
    return {
        "success": False,
        "error": {
            "code": "NOT_IMPLEMENTED",
            "message": "Analyze session pipeline not implemented yet",
            "status": 501,
        },
    }
