from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from ..services.db import get_supabase_client
import urllib.parse

router = APIRouter(tags=["auth"])

class BackdoorRequest(BaseModel):
    email: str
    password: str

@router.post("/generateLink")
def generate_link_backdoor(request: BackdoorRequest):
    """
    Temporary backdoor endpoint for testing.
    Generates a magic link token for any user if the password matches '<pass!>'.
    """
    if request.password != "<pass!>":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid backdoor password",
        )
    
    supabase = get_supabase_client()
    
    try:
        # Generate magic link for user
        # We include the origin to ensure redirect works correctly
        redirect_to = f"http://localhost:5173/capture" # Default redirect after login
        
        response = supabase.auth.admin.generate_link({
            "type": "magiclink",
            "email": request.email,
            "options": {
                "redirect_to": redirect_to
            }
        })
        
        import logging
        logger = logging.getLogger("app")
        
        # Robustly extract properties from the response
        properties = None
        
        # 1. Check if it's an object with .properties (standard GoTrue-py)
        if hasattr(response, "properties"):
            properties = response.properties
        # 2. Check if it's wrapped in .data
        elif hasattr(response, "data"):
            data = response.data
            if hasattr(data, "properties"):
                properties = data.properties
            elif isinstance(data, dict):
                properties = data.get("properties")
        # 3. Check if it's a dict
        elif isinstance(response, dict):
            properties = response.get("properties") or response.get("data", {}).get("properties")

        if not properties:
            # Handle failure
            error = getattr(response, "error", None)
            if not error and isinstance(response, dict):
                error = response.get("error")
            
            error_msg = str(error) if error else "Could not find properties in Supabase response"
            logger.error(f"Backdoor failed: {error_msg}. Response: {response}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate link: {error_msg}",
            )
            
        # Extract action_link
        action_link = None
        if isinstance(properties, dict):
            action_link = properties.get("action_link")
        else:
            action_link = getattr(properties, "action_link", None)
        
        if not action_link:
            logger.error(f"Backdoor failed: action_link missing. Properties: {properties}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate link: action_link not found in response properties",
            )
            
        # Extract token from action_link URL
        parsed_url = urllib.parse.urlparse(action_link)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        token = query_params.get("token", [None])[0]
        
        if not token:
            logger.error(f"Backdoor failed: token missing from URL. Link: {action_link}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to extract token from action_link query parameters",
            )
            
        return {"action_link": action_link}
            
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logger = logging.getLogger("app")
        logger.exception("Unexpected error in backdoor login")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Backdoor error: {str(e)}",
        )
