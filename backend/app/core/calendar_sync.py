"""
Google Calendar Sync Service.

Handles OAuth2 flow and periodic background polling of Google Calendar events
to trigger the 30-second meeting transitions (FR2.5).
"""
import logging
import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.api.events import create_meeting_transition
from app.models.events import EmployeeCalendarSettings, OccupancyState, PendingStateTransition

# Google API Clients
try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build
    from google.auth.transport.requests import Request
    from google.auth.exceptions import RefreshError
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False


logger = logging.getLogger("eraots.calendar_sync")

# Google APIs read-only calendar scope
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


def _get_client_config():
    """Build the client_secret.json structure from env vars."""
    return {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "project_id": "eraots-calendar-sync",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
        }
    }


def build_google_auth_url(employee_id: uuid.UUID) -> str:
    """Generate the Google OAuth consent URL."""
    if not GOOGLE_AUTH_AVAILABLE or not settings.GOOGLE_CLIENT_ID:
        raise ValueError("Google API client not configured or installed.")

    flow = Flow.from_client_config(
        _get_client_config(), 
        scopes=SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI
    )
    
    # We pass employee_id in the state parameter to know who is connecting
    auth_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
        state=str(employee_id),
    )
    return auth_url


async def exchange_google_code(db: AsyncSession, code: str, employee_id: str) -> None:
    """Exchange auth code for tokens and save to settings."""
    if not GOOGLE_AUTH_AVAILABLE:
        raise ValueError("Google API client not configured.")

    flow = Flow.from_client_config(
        _get_client_config(), 
        scopes=SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI
    )
    
    flow.fetch_token(code=code)
    credentials = flow.credentials

    # Find and update the employee's calendar settings
    emp_uuid = uuid.UUID(employee_id)
    result = await db.execute(
        select(EmployeeCalendarSettings).where(
            EmployeeCalendarSettings.employee_id == emp_uuid
        )
    )
    cal_settings = result.scalar_one_or_none()
    
    if not cal_settings:
        cal_settings = EmployeeCalendarSettings(employee_id=emp_uuid)
        db.add(cal_settings)
    
    cal_settings.provider = "GOOGLE"
    cal_settings.is_enabled = True
    cal_settings.sync_enabled = True
    cal_settings.access_token = credentials.token
    cal_settings.refresh_token = credentials.refresh_token
    # Expiry is naïve passing back from google api usually but stored as UTC aware
    if credentials.expiry:
        cal_settings.token_expires_at = credentials.expiry.replace(tzinfo=timezone.utc)
    
    await db.commit()
    logger.info(f"Successfully connected Google Calendar for employee {employee_id}")


async def sync_employee_calendar(db: AsyncSession, cal_settings: EmployeeCalendarSettings) -> int:
    """
    Poll an employee's Google Calendar for meetings starting very soon (next 2 mins).
    Returns number of transitions triggered.
    """
    if not GOOGLE_AUTH_AVAILABLE:
        return 0

    if not cal_settings.access_token:
        cal_settings.sync_error = "Missing access token"
        return 0

    credentials = Credentials(
        token=cal_settings.access_token,
        refresh_token=cal_settings.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )

    # Refresh token if expired
    if credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(Request())
            cal_settings.access_token = credentials.token
            if credentials.expiry:
                cal_settings.token_expires_at = credentials.expiry.replace(tzinfo=timezone.utc)
        except RefreshError as e:
            cal_settings.sync_error = f"Token refresh failed: {e}"
            cal_settings.sync_enabled = False
            return 0

    try:
        service = build('calendar', 'v3', credentials=credentials)
        
        now = datetime.now(timezone.utc)
        # Look ahead 2 minutes
        time_max = now + timedelta(minutes=2)
        
        # Call the Calendar API
        events_result = service.events().list(
            calendarId='primary', 
            timeMin=now.isoformat(),
            timeMax=time_max.isoformat(),
            maxResults=5, 
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        events = events_result.get('items', [])
        triggered_count = 0
        
        if not events:
            cal_settings.last_sync_at = now
            cal_settings.sync_error = None
            return 0
            
        # Check current occupancy state
        state_res = await db.execute(
            select(OccupancyState).where(OccupancyState.employee_id == cal_settings.employee_id)
        )
        occupancy_state = state_res.scalar_one_or_none()
        
        # Don't trigger if outside or already in meeting
        if not occupancy_state or occupancy_state.current_status in ("OUTSIDE", "IN_MEETING"):
            cal_settings.last_sync_at = now
            cal_settings.sync_error = None
            return 0
            
        # Check if they already have a pending transition block
        pending_res = await db.execute(select(PendingStateTransition).where(
            and_(
                PendingStateTransition.employee_id == cal_settings.employee_id,
                PendingStateTransition.status == "PENDING"
            )
        ))
        if pending_res.scalar_one_or_none():
            cal_settings.last_sync_at = now
            return 0
            
        for event in events:
            # Check if we already processed this meeting today (to avoid spamming)
            # We look for pending transitions triggered by this event ID in the last few hours
            cutoff = now - timedelta(hours=12)
            processed_res = await db.execute(select(PendingStateTransition).where(
                and_(
                    PendingStateTransition.employee_id == cal_settings.employee_id,
                    PendingStateTransition.calendar_event_id == event['id'],
                    PendingStateTransition.triggered_at >= cutoff
                )
            ))
            if processed_res.scalar_one_or_none():
                continue
                
            # Create the 30-second warning block
            title = event.get('summary', 'Scheduled Meeting')
            await create_meeting_transition(
                db=db,
                employee_id=cal_settings.employee_id,
                calendar_event_id=event['id'],
                calendar_event_title=title,
                current_status=occupancy_state.current_status
            )
            triggered_count += 1
            break  # Only trigger one meeting at a time
            
        cal_settings.last_sync_at = now
        cal_settings.sync_error = None
        return triggered_count

    except Exception as e:
        logger.error(f"Error syncing calendar for {cal_settings.employee_id}: {e}")
        cal_settings.sync_error = str(e)
        return 0


async def poll_all_calendars(db: AsyncSession) -> int:
    """
    Called by the background scheduler.
    Iterates through all employees with active Google Calendar sync
    and polls for upcoming meetings.
    """
    if not GOOGLE_AUTH_AVAILABLE or not settings.GOOGLE_CLIENT_ID:
        return 0
        
    result = await db.execute(
        select(EmployeeCalendarSettings).where(
            and_(
                EmployeeCalendarSettings.provider == "GOOGLE",
                EmployeeCalendarSettings.is_enabled == True,
                EmployeeCalendarSettings.sync_enabled == True
            )
        )
    )
    all_settings = result.scalars().all()
    
    total_triggered = 0
    for cal_settings in all_settings:
        triggered = await sync_employee_calendar(db, cal_settings)
        total_triggered += triggered
        
    if total_triggered > 0:
        await db.commit()
        
    return total_triggered
