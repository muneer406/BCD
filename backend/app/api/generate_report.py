from fastapi import APIRouter, Depends

from ..dependencies import get_current_user

router = APIRouter(tags=["reports"])


@router.post("/generate-report/{session_id}")
def generate_report(session_id: str, user=Depends(get_current_user)):
    return {
        "success": False,
        "error": {
            "code": "NOT_IMPLEMENTED",
            "message": "Report generation not implemented yet",
            "status": 501,
        },
    }
