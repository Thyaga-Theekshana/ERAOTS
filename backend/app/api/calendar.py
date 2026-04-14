from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.employee import UserAccount
from app.models.events import EmployeeCalendarSettings
from app.core.calendar_sync import build_google_auth_url, exchange_google_code, GOOGLE_AUTH_AVAILABLE

router = APIRouter(prefix="/api/calendar", tags=["Calendar Sync"])


@router.get("/connect")
async def connect_calendar(
    current_user: UserAccount = Depends(get_current_user),
):
    """
    Returns the Google OAuth consent URL.
    The frontend should redirect the user to this URL.
    """
    if not GOOGLE_AUTH_AVAILABLE:
        raise HTTPException(
            status_code=503, 
            detail="Google Calendar Integration is not configured or available on this server."
        )

    try:
        url = build_google_auth_url(current_user.employee_id)
        return {"auth_url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate auth URL: {e}")


@router.get("/callback")
async def google_callback(
    code: str,
    state: str = Query(..., description="The employee ID passed as state"),
    db: AsyncSession = Depends(get_db)
):
    """
    Google OAuth callback endpoint.
    Google redirects back to here with the authorization code.
    """
    if not GOOGLE_AUTH_AVAILABLE:
        raise HTTPException(status_code=503, detail="Service unavailable")

    try:
        # Validate that state is a valid UUID
        try:
            employee_id = str(uuid.UUID(state))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid state parameter")

        # Exchange code for tokens
        await exchange_google_code(db, code, employee_id)
        
        # In a real app we'd redirect back to the frontend with success
        # Assuming frontend runs on localhost:5173
        return RedirectResponse(url="http://localhost:5173/my-profile?calendar_status=success")
        
    except Exception as e:
        return RedirectResponse(url=f"http://localhost:5173/my-profile?calendar_status=error&detail={str(e)}")


@router.delete("/disconnect")
async def disconnect_calendar(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Disconnects the integrated calendar and deletes tokens."""
    result = await db.execute(
        select(EmployeeCalendarSettings).where(
            EmployeeCalendarSettings.employee_id == current_user.employee_id
        )
    )
    settings = result.scalar_one_or_none()
    
    if not settings:
        return {"message": "No calendar connected"}
        
    settings.provider = "NONE"
    settings.is_enabled = False
    settings.sync_enabled = False
    settings.access_token = None
    settings.refresh_token = None
    settings.token_expires_at = None
    
    await db.commit()
    return {"message": "Calendar disconnected successfully"}
