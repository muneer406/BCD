from fastapi import APIRouter, Depends

from ..dependencies import get_current_user

router = APIRouter(tags=["comparison"])


@router.post("/compare-sessions/{current_session_id}/{previous_session_id}")
def compare_sessions(
    current_session_id: str,
    previous_session_id: str,
    user=Depends(get_current_user),
):
    return {
        "success": False,
        "error": {
            "code": "NOT_IMPLEMENTED",
            "message": "Comparison pipeline not implemented yet",
            "status": 501,
        },
    }
