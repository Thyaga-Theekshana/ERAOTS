"""
Scan Event API — FR1 (Biometric Event Listener) + FR2 (Occupancy Engine).
The heart of the system: receives scans, toggles state, updates occupancy.

Hybrid "Away vs On-Desk" Architecture:
- Hierarchy of Truth: Biometric OUT > Manual Toggle > Calendar Sync
- 30-Second Rule: Calendar transitions require confirmation or auto-confirm after timeout
"""
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo
import uuid
import json
import logging

from app.core.database import get_db
from app.core.security import hash_fingerprint
from app.core.dependencies import get_current_user, require_roles
from app.models.employee import Employee, UserAccount, Role
from app.models.events import (
    ScanEvent,
    OccupancyState,
    PendingStateTransition,
    EmployeeCalendarSettings,
    EmployeeTimezonePreference,
    SpecialMeeting,
    StatusLog,
    OCCUPANCY_STATUSES,
)
from app.models.hardware import Scanner
from app.models.notifications import Notification
from app.api.schemas import (
    ScanEventRequest, ScanEventResponse, OccupancyOverview, EmployeeOccupancyState,
    StatusOverrideRequest, StatusOverrideResponse,
    PendingTransitionResponse, TransitionActionRequest, TransitionActionResponse,
    CalendarSettingsUpdate, CalendarSettingsResponse,
    SpecialMeetingCreate, SpecialMeetingResponse,
    MessageResponse,
)
from app.core.config import settings

router = APIRouter(prefix="/api/events", tags=["Scan Events"])
logger = logging.getLogger(__name__)

# WebSocket connections for live dashboard (FR3.3)
dashboard_connections: List[WebSocket] = []

DUPLICATE_SCAN_THRESHOLD_SECONDS = 10
TRANSITION_TIMEOUT_SECONDS = 30  # The 30-second rule


async def broadcast_to_dashboards(message: dict):
    """Push real-time updates to all connected dashboards."""
    disconnected = []
    for ws in dashboard_connections:
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        dashboard_connections.remove(ws)


async def log_status_change(
    db: AsyncSession,
    employee_id: uuid.UUID,
    from_status: Optional[str],
    to_status: str,
    source: str,
    changed_at: datetime,
    scan_event_id: Optional[uuid.UUID] = None,
) -> StatusLog:
    """
    Persist an immutable record of every employee status transition.
    This is the backbone of accurate "active hours" calculation (FR4).
    
    Called whenever an employee's OccupancyState changes — regardless of whether
    the change was triggered by a biometric scan, a manual portal toggle, or a
    calendar sync event.
    """
    entry = StatusLog(
        employee_id=employee_id,
        from_status=from_status,
        to_status=to_status,
        source=source,
        changed_at=changed_at,
        scan_event_id=scan_event_id,
    )
    db.add(entry)
    return entry


def _parse_timezone(tz_name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or settings.OFFICE_TIMEZONE)
    except Exception:
        return ZoneInfo(settings.OFFICE_TIMEZONE)


def _to_utc(input_dt: datetime, timezone_name: Optional[str]) -> datetime:
    if input_dt.tzinfo is None:
        localized = input_dt.replace(tzinfo=_parse_timezone(timezone_name))
    else:
        localized = input_dt
    return localized.astimezone(timezone.utc)


def _to_local(input_dt: datetime, timezone_name: Optional[str]) -> datetime:
    return input_dt.astimezone(_parse_timezone(timezone_name))


@router.post("/scan", response_model=ScanEventResponse)
async def receive_scan_event(
    scan: ScanEventRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    FR1: Receive and process a scan event from biometric hardware.
    
    Flow:
    1. Validate scanner exists and is authenticated
    2. Hash fingerprint and look up employee
    3. Check for duplicate scans (FR1.7)
    4. Determine direction via Smart Toggle (FR2.1)
    5. Create immutable ScanEvent record (NFR2)
    6. Update OccupancyState (FR2.2)
    7. Broadcast to dashboards via WebSocket (FR3.3) 
    """
    scan_time = scan.timestamp or datetime.now(timezone.utc)
    
    # Step 1: Validate scanner
    scanner_result = await db.execute(
        select(Scanner).where(Scanner.scanner_id == scan.scanner_id)
    )
    scanner = scanner_result.scalar_one_or_none()
    if not scanner:
        raise HTTPException(status_code=404, detail="Scanner not registered")
    
    # Step 2: Look up employee by fingerprint hash
    fp_hash = hash_fingerprint(scan.fingerprint_id)
    emp_result = await db.execute(
        select(Employee).where(Employee.fingerprint_hash == fp_hash)
    )
    employee = emp_result.scalar_one_or_none()
    
    if not employee:
        # FR1.3: Log unauthorized access attempt
        event = ScanEvent(
            scanner_id=scan.scanner_id,
            employee_id=None,
            fingerprint_hash=fp_hash,
            scan_timestamp=scan_time,
            direction="UNKNOWN",
            event_source="HARDWARE",
            is_valid=False,
            rejection_reason="UNREGISTERED",
            raw_data={"fingerprint_id": scan.fingerprint_id},
        )
        db.add(event)
        await db.flush()
        logger.warning(f"Unauthorized scan attempt at scanner {scanner.name}")
        
        # Broadcast alert
        await broadcast_to_dashboards({
            "type": "UNAUTHORIZED_ACCESS",
            "scanner": scanner.door_name,
            "timestamp": scan_time.isoformat(),
        })
        
        return ScanEventResponse(
            event_id=event.event_id,
            scanner_id=scan.scanner_id,
            direction="UNKNOWN",
            scan_timestamp=scan_time,
            is_valid=False,
            rejection_reason="UNREGISTERED",
            door_name=scanner.door_name,
        )
    
    # Step 3: Check for duplicate scans (FR1.7)
    dup_result = await db.execute(
        select(ScanEvent)
        .where(
            ScanEvent.employee_id == employee.employee_id,
            ScanEvent.scanner_id == scan.scanner_id,
            ScanEvent.scan_timestamp >= scan_time - timedelta(seconds=DUPLICATE_SCAN_THRESHOLD_SECONDS),
            ScanEvent.is_valid == True,
        )
        .order_by(ScanEvent.scan_timestamp.desc())
        .limit(1)
    )
    duplicate = dup_result.scalar_one_or_none()
    
    if duplicate:
        event = ScanEvent(
            scanner_id=scan.scanner_id,
            employee_id=employee.employee_id,
            fingerprint_hash=fp_hash,
            scan_timestamp=scan_time,
            direction="UNKNOWN",
            event_source="HARDWARE",
            is_valid=False,
            rejection_reason="DUPLICATE",
        )
        db.add(event)
        await db.flush()
        logger.info(f"Duplicate scan ignored for {employee.full_name}")
        
        return ScanEventResponse(
            event_id=event.event_id,
            scanner_id=scan.scanner_id,
            employee_id=employee.employee_id,
            employee_name=employee.full_name,
            direction="UNKNOWN",
            scan_timestamp=scan_time,
            is_valid=False,
            rejection_reason="DUPLICATE",
            door_name=scanner.door_name,
        )
    
    # Step 4: Smart Toggle — determine direction (FR2.1)
    # Updated to handle IN_MEETING status and Hierarchy of Truth
    state_result = await db.execute(
        select(OccupancyState).where(OccupancyState.employee_id == employee.employee_id)
    )
    occupancy_state = state_result.scalar_one_or_none()
    
    if occupancy_state is None:
        # First scan ever — create state, direction is IN
        direction = "IN"
        previous_status = None
        occupancy_state = OccupancyState(
            employee_id=employee.employee_id,
            current_status="ACTIVE",
            last_state_change=scan_time,
            last_change_source="BIOMETRIC",
        )
        db.add(occupancy_state)
    else:
        previous_status = occupancy_state.current_status
        # Toggle based on current status (IN_MEETING is treated as "inside")
        if occupancy_state.current_status in ("ACTIVE", "ON_BREAK", "AWAY", "IN_MEETING"):
            # Was inside (including in meeting) → this scan means EXIT
            direction = "OUT"
            occupancy_state.current_status = "OUTSIDE"  # Biometric OUT = Ultimate Priority
            occupancy_state.last_change_source = "BIOMETRIC"
            
            # HIERARCHY OF TRUTH: Biometric OUT aborts any pending calendar transitions
            await abort_pending_transitions(db, employee.employee_id, "BIOMETRIC_OUT")
        else:
            # Was outside → this scan means ENTRY
            direction = "IN"
            occupancy_state.current_status = "ACTIVE"
            occupancy_state.last_change_source = "BIOMETRIC"
        
        occupancy_state.last_state_change = scan_time
    
    # Step 5: Create immutable ScanEvent (NFR2)
    event = ScanEvent(
        scanner_id=scan.scanner_id,
        employee_id=employee.employee_id,
        fingerprint_hash=fp_hash,
        scan_timestamp=scan_time,
        direction=direction,
        event_source="HARDWARE",
        is_valid=True,
    )
    db.add(event)
    await db.flush()
    
    # Step 5b: Log the status transition for accurate time-tracking (FR4)
    await log_status_change(
        db=db,
        employee_id=employee.employee_id,
        from_status=previous_status,
        to_status=occupancy_state.current_status,
        source="BIOMETRIC",
        changed_at=scan_time,
        scan_event_id=event.event_id,
    )
    
    # Step 6: Update occupancy state reference
    occupancy_state.last_scan_event_id = event.event_id
    
    logger.info(f"Scan processed: {employee.full_name} {direction} at {scanner.door_name}")
    
    # Step 7: Broadcast to dashboards
    await broadcast_to_dashboards({
        "type": "SCAN_EVENT",
        "employee_name": employee.full_name,
        "employee_id": str(employee.employee_id),
        "direction": direction,
        "door": scanner.door_name,
        "status": occupancy_state.current_status,
        "timestamp": scan_time.isoformat(),
    })
    
    return ScanEventResponse(
        event_id=event.event_id,
        scanner_id=scan.scanner_id,
        employee_id=employee.employee_id,
        employee_name=employee.full_name,
        direction=direction,
        scan_timestamp=scan_time,
        is_valid=True,
        door_name=scanner.door_name,
    )


@router.get("/recent", response_model=List[ScanEventResponse])
async def get_recent_events(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """FR3.2: Get the most recent scan events for the live feed."""
    result = await db.execute(
        select(ScanEvent)
        .where(ScanEvent.is_valid == True)
        .order_by(ScanEvent.scan_timestamp.desc())
        .limit(limit)
    )
    events = result.scalars().all()
    
    responses = []
    for event in events:
        emp_result = await db.execute(
            select(Employee).where(Employee.employee_id == event.employee_id)
        )
        emp = emp_result.scalar_one_or_none()
        
        scanner_result = await db.execute(
            select(Scanner).where(Scanner.scanner_id == event.scanner_id)
        )
        scanner = scanner_result.scalar_one_or_none()
        
        responses.append(ScanEventResponse(
            event_id=event.event_id,
            scanner_id=event.scanner_id,
            employee_id=event.employee_id,
            employee_name=emp.full_name if emp else None,
            direction=event.direction,
            scan_timestamp=event.scan_timestamp,
            is_valid=event.is_valid,
            rejection_reason=event.rejection_reason,
            door_name=scanner.door_name if scanner else None,
        ))
    
    return responses


# ==================== OCCUPANCY (FR2) ====================

@router.get("/occupancy", response_model=OccupancyOverview)
async def get_occupancy(db: AsyncSession = Depends(get_db)):
    """FR2.4: Get current real-time occupancy overview (including IN_MEETING status)."""
    
    # Count by status
    result = await db.execute(
        select(
            OccupancyState.current_status,
            func.count(OccupancyState.state_id),
        ).group_by(OccupancyState.current_status)
    )
    counts = {row[0]: row[1] for row in result.all()}
    
    active = counts.get("ACTIVE", 0)
    in_meeting = counts.get("IN_MEETING", 0)
    on_break = counts.get("ON_BREAK", 0)
    away = counts.get("AWAY", 0)
    outside = counts.get("OUTSIDE", 0)
    # IN_MEETING employees are inside the building but away from desk
    total_inside = active + in_meeting + on_break
    
    return OccupancyOverview(
        total_inside=total_inside,
        total_capacity=settings.OFFICE_CAPACITY,
        occupancy_percentage=round((total_inside / settings.OFFICE_CAPACITY) * 100, 1) if settings.OFFICE_CAPACITY > 0 else 0,
        active_count=active,
        in_meeting_count=in_meeting,
        on_break_count=on_break,
        away_count=away,
        outside_count=outside,
    )


@router.get("/occupancy/employees", response_model=List[EmployeeOccupancyState])
async def get_employee_states(
    status_filter: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Get current status for all employees, optionally filtered by status."""
    query = select(OccupancyState)
    if status_filter:
        query = query.where(OccupancyState.current_status == status_filter.upper())
    
    result = await db.execute(query)
    states = result.scalars().all()
    
    responses = []
    for state in states:
        emp_result = await db.execute(
            select(Employee).where(Employee.employee_id == state.employee_id)
        )
        emp = emp_result.scalar_one_or_none()
        if emp:
            dept_name = None
            if emp.department:
                dept_name = emp.department.name
                
            responses.append(EmployeeOccupancyState(
                employee_id=state.employee_id,
                employee_name=emp.full_name,
                department=dept_name,
                current_status=state.current_status,
                last_state_change=state.last_state_change,
            ))
    
    return responses


# ==================== STATUS TIMELINE (FR4 — "Active Hours" breakdown) ====================

@router.get("/status-timeline/{employee_id}")
async def get_status_timeline(
    employee_id: uuid.UUID,
    target_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """
    FR4: Return the full status timeline for an employee on a given day.

    This endpoint exposes the StatusLog audit trail so the frontend can render
    a visual time-breakdown showing:
    - Total time in building (first entry → last exit)
    - Active / At-Desk time (ACTIVE status periods)
    - Meeting time (IN_MEETING status periods)
    - Break time (ON_BREAK / AWAY periods while inside)

    Example response for employee who entered @9am, took a break 11:00–11:20am,
    had a meeting 2:00–3:30pm, and left @5pm:
    {
        "total_building_min": 480,
        "total_active_min": 330,
        "total_meeting_min": 90,
        "total_break_min": 20,
        "segments": [
            {"status": "ACTIVE",    "from": "09:00", "to": "11:00", "duration_min": 120},
            {"status": "ON_BREAK",  "from": "11:00", "to": "11:20", "duration_min": 20},
            {"status": "ACTIVE",    "from": "11:20", "to": "14:00", "duration_min": 160},
            {"status": "IN_MEETING","from": "14:00", "to": "15:30", "duration_min": 90},
            {"status": "ACTIVE",    "from": "15:30", "to": "17:00", "duration_min": 90},
        ]
    }
    """
    from datetime import date as date_type

    # Only allow viewing own timeline unless admin/HR
    if (current_user.employee_id != employee_id
            and current_user.role.name == "EMPLOYEE"):
        raise HTTPException(status_code=403, detail="Cannot view another employee's timeline")

    # Parse date (defaults to today)
    try:
        day = date_type.fromisoformat(target_date) if target_date else date_type.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    start_of_day = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    end_of_day = datetime.combine(day, datetime.max.time(), tzinfo=timezone.utc)

    # Fetch all status log entries for the day, in chronological order
    log_result = await db.execute(
        select(StatusLog)
        .where(
            and_(
                StatusLog.employee_id == employee_id,
                StatusLog.changed_at >= start_of_day,
                StatusLog.changed_at <= end_of_day,
            )
        )
        .order_by(StatusLog.changed_at.asc())
    )
    logs = log_result.scalars().all()

    if not logs:
        return {
            "employee_id": str(employee_id),
            "date": day.isoformat(),
            "total_building_min": 0,
            "total_active_min": 0,
            "total_meeting_min": 0,
            "total_break_min": 0,
            "segments": [],
        }

    # Build time segments from consecutive log entries
    segments = []
    total_active = 0
    total_meeting = 0
    total_break = 0

    for i in range(len(logs) - 1):
        current_log = logs[i]
        next_log = logs[i + 1]
        duration_min = int((next_log.changed_at - current_log.changed_at).total_seconds() / 60)

        segments.append({
            "status": current_log.to_status,
            "from": current_log.changed_at.isoformat(),
            "to": next_log.changed_at.isoformat(),
            "duration_min": duration_min,
            "source": current_log.source,
        })

        if current_log.to_status == "ACTIVE":
            total_active += duration_min
        elif current_log.to_status == "IN_MEETING":
            total_meeting += duration_min
        elif current_log.to_status in ("ON_BREAK", "AWAY"):
            total_break += duration_min

    # Handle the last segment — if employee is still inside, segment runs to now
    last_log = logs[-1]
    if last_log.to_status != "OUTSIDE":
        now = datetime.now(timezone.utc)
        cap = min(now, end_of_day)
        trailing_min = int((cap - last_log.changed_at).total_seconds() / 60)
        if trailing_min > 0:
            segments.append({
                "status": last_log.to_status,
                "from": last_log.changed_at.isoformat(),
                "to": cap.isoformat(),
                "duration_min": trailing_min,
                "source": last_log.source,
                "is_ongoing": True,
            })
            if last_log.to_status == "ACTIVE":
                total_active += trailing_min
            elif last_log.to_status == "IN_MEETING":
                total_meeting += trailing_min
            elif last_log.to_status in ("ON_BREAK", "AWAY"):
                total_break += trailing_min

    # Total building time = first entry to last exit (or now if still inside).
    # Use the first log where from_status is OUTSIDE (or NULL) and to_status != OUTSIDE
    # to correctly identify the building-entry moment regardless of subsequent transitions.
    first_entry_log = next(
        (lg for lg in logs if lg.to_status != "OUTSIDE" and (lg.from_status is None or lg.from_status == "OUTSIDE")),
        None,
    )
    last_exit_log = None
    for lg in reversed(logs):
        if lg.to_status == "OUTSIDE":
            last_exit_log = lg
            break

    total_building = 0
    if first_entry_log:
        end_ts = last_exit_log.changed_at if last_exit_log else min(datetime.now(timezone.utc), end_of_day)
        total_building = int((end_ts - first_entry_log.changed_at).total_seconds() / 60)

    return {
        "employee_id": str(employee_id),
        "date": day.isoformat(),
        "total_building_min": total_building,
        "total_active_min": total_active,
        "total_meeting_min": total_meeting,
        "total_break_min": total_break,
        "total_productive_min": total_active + total_meeting,
        "segments": segments,
    }


# ==================== WEBSOCKET (FR3.3) ====================

@router.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time dashboard updates."""
    await websocket.accept()
    dashboard_connections.append(websocket)
    logger.info(f"Dashboard client connected. Total: {len(dashboard_connections)}")
    
    try:
        while True:
            # Keep connection alive, listen for client messages
            data = await websocket.receive_text()
            # Client can send ping/pong or filter requests
    except WebSocketDisconnect:
        dashboard_connections.remove(websocket)
        logger.info(f"Dashboard client disconnected. Total: {len(dashboard_connections)}")


# ==================== HYBRID STATUS TRACKING (The 30-Second Rule) ====================

async def abort_pending_transitions(
    db: AsyncSession, 
    employee_id: uuid.UUID, 
    reason: str
) -> int:
    """
    Abort all pending transitions for an employee (Hierarchy of Truth enforcement).
    Called when biometric OUT scan occurs or manual override is applied.
    Returns the count of aborted transitions.
    """
    result = await db.execute(
        select(PendingStateTransition).where(
            and_(
                PendingStateTransition.employee_id == employee_id,
                PendingStateTransition.status == "PENDING"
            )
        )
    )
    pending = result.scalars().all()
    
    aborted_count = 0
    now = datetime.now(timezone.utc)
    for transition in pending:
        transition.status = "ABORTED"
        transition.resolution_source = reason
        transition.resolved_at = now
        aborted_count += 1
        logger.info(f"Aborted pending transition {transition.transition_id} for employee {employee_id} due to {reason}")
    
    return aborted_count


async def create_meeting_transition(
    db: AsyncSession,
    employee_id: uuid.UUID,
    calendar_event_id: Optional[str],
    calendar_event_title: Optional[str],
    current_status: str,
) -> PendingStateTransition:
    """
    Create a pending state transition for a calendar meeting (30-second rule).
    Also creates an actionable notification for the employee.
    """
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=TRANSITION_TIMEOUT_SECONDS)
    
    # Create the pending transition
    transition = PendingStateTransition(
        employee_id=employee_id,
        trigger_source="CALENDAR_SYNC",
        calendar_event_id=calendar_event_id,
        calendar_event_title=calendar_event_title,
        from_status=current_status,
        to_status="IN_MEETING",
        triggered_at=now,
        expires_at=expires_at,
        status="PENDING",
    )
    db.add(transition)
    await db.flush()
    
    # Create actionable notification
    meeting_name = calendar_event_title or "Scheduled Meeting"
    notification = Notification(
        recipient_id=employee_id,
        title=f"Meeting Starting: {meeting_name}",
        message=f"Transitioning your status to 'In Meeting' in {TRANSITION_TIMEOUT_SECONDS} seconds.",
        type="MEETING_TRANSITION",
        channel="IN_APP",
        priority="HIGH",
        is_actionable=True,
        action_type="CONFIRM_TRANSITION",
        action_metadata={
            "transition_id": str(transition.transition_id),
            "buttons": [
                {"label": "Cancel", "action": "CANCEL"},
                {"label": "Confirm Now", "action": "CONFIRM"},
            ],
            "expires_at": expires_at.isoformat(),
            "meeting_title": meeting_name,
        },
        delivery_status="DELIVERED",
    )
    db.add(notification)
    await db.flush()
    
    # Link notification to transition
    transition.notification_id = notification.notification_id
    
    # Broadcast to dashboards
    await broadcast_to_dashboards({
        "type": "PENDING_TRANSITION",
        "employee_id": str(employee_id),
        "transition_id": str(transition.transition_id),
        "meeting_title": meeting_name,
        "expires_at": expires_at.isoformat(),
    })
    
    logger.info(f"Created pending meeting transition for employee {employee_id}: {meeting_name}")
    return transition


@router.get("/pending-transitions", response_model=List[PendingTransitionResponse])
async def get_pending_transitions(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all pending state transitions for the current user.
    These are calendar-triggered transitions awaiting confirmation (30-second rule).
    """
    result = await db.execute(
        select(PendingStateTransition).where(
            and_(
                PendingStateTransition.employee_id == current_user.employee_id,
                PendingStateTransition.status == "PENDING"
            )
        ).order_by(PendingStateTransition.expires_at.asc())
    )
    transitions = result.scalars().all()
    
    now = datetime.now(timezone.utc)
    responses = []
    for t in transitions:
        seconds_remaining = max(0, int((t.expires_at - now).total_seconds()))
        responses.append(PendingTransitionResponse(
            transition_id=t.transition_id,
            employee_id=t.employee_id,
            trigger_source=t.trigger_source,
            calendar_event_title=t.calendar_event_title,
            from_status=t.from_status,
            to_status=t.to_status,
            triggered_at=t.triggered_at,
            expires_at=t.expires_at,
            seconds_remaining=seconds_remaining,
            status=t.status,
            notification_id=t.notification_id,
        ))
    
    return responses


@router.put("/pending-transitions/{transition_id}/action", response_model=TransitionActionResponse)
async def action_pending_transition(
    transition_id: uuid.UUID,
    action_request: TransitionActionRequest,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    User action on a pending transition: CONFIRM or CANCEL.
    
    - CANCEL: Abort the transition, keep current status (employee stays ACTIVE)
    - CONFIRM: Immediately execute the transition (employee becomes IN_MEETING)
    """
    action = action_request.action.upper()
    if action not in ("CONFIRM", "CANCEL"):
        raise HTTPException(status_code=400, detail="Action must be CONFIRM or CANCEL")
    
    # Find the transition
    result = await db.execute(
        select(PendingStateTransition).where(
            PendingStateTransition.transition_id == transition_id
        )
    )
    transition = result.scalar_one_or_none()
    
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    
    if transition.employee_id != current_user.employee_id:
        raise HTTPException(status_code=403, detail="Cannot modify another user's transition")
    
    if transition.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Transition already resolved: {transition.status}")
    
    now = datetime.now(timezone.utc)
    
    # Get the employee's occupancy state
    state_result = await db.execute(
        select(OccupancyState).where(OccupancyState.employee_id == current_user.employee_id)
    )
    occupancy_state = state_result.scalar_one_or_none()
    
    if action == "CANCEL":
        transition.status = "CANCELLED"
        transition.resolution_source = "USER_CANCEL"
        transition.resolved_at = now
        new_status = occupancy_state.current_status if occupancy_state else "ACTIVE"
        message = "Meeting transition cancelled. Status unchanged."
        logger.info(f"User cancelled meeting transition {transition_id}")
    else:  # CONFIRM
        previous_status = occupancy_state.current_status if occupancy_state else "ACTIVE"
        transition.status = "CONFIRMED"
        transition.resolution_source = "USER_CONFIRM"
        transition.resolved_at = now
        
        # Update occupancy state to IN_MEETING
        if occupancy_state:
            occupancy_state.current_status = "IN_MEETING"
            occupancy_state.last_state_change = now
            occupancy_state.last_change_source = "CALENDAR_SYNC"
        
        # Log the status transition for time-tracking (FR4)
        await log_status_change(
            db=db,
            employee_id=current_user.employee_id,
            from_status=previous_status,
            to_status="IN_MEETING",
            source="CALENDAR_SYNC",
            changed_at=now,
        )
        
        new_status = "IN_MEETING"
        message = "Status changed to In Meeting."
        logger.info(f"User confirmed meeting transition {transition_id}")
        
        # Broadcast status change
        await broadcast_to_dashboards({
            "type": "STATUS_CHANGE",
            "employee_id": str(current_user.employee_id),
            "new_status": "IN_MEETING",
            "source": "CALENDAR_CONFIRM",
            "timestamp": now.isoformat(),
        })
    
    # Update the notification
    if transition.notification_id:
        notif_result = await db.execute(
            select(Notification).where(Notification.notification_id == transition.notification_id)
        )
        notification = notif_result.scalar_one_or_none()
        if notification:
            notification.action_taken = action
            notification.action_taken_at = now
            notification.is_read = True
            notification.read_at = now
    
    await db.commit()
    
    return TransitionActionResponse(
        transition_id=transition_id,
        action_taken=action,
        new_status=new_status,
        message=message,
    )


@router.put("/pending-transitions/{transition_id}/reject", response_model=TransitionActionResponse)
async def reject_pending_transition(
    transition_id: uuid.UUID,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Shortcut to reject/cancel a pending transition.
    Equivalent to calling action with CANCEL.
    """
    return await action_pending_transition(
        transition_id=transition_id,
        action_request=TransitionActionRequest(action="CANCEL"),
        current_user=current_user,
        db=db,
    )


# ==================== MANUAL STATUS OVERRIDE (Hierarchy of Truth: High Priority) ====================

@router.put("/status-override", response_model=StatusOverrideResponse)
async def override_status(
    override: StatusOverrideRequest,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Manual portal toggle for status override.
    
    Hierarchy of Truth: Manual override takes precedence over calendar syncing.
    Valid target statuses: ACTIVE (At Desk) or IN_MEETING (Away/In Meeting)
    
    This endpoint:
    1. Validates the employee is currently inside the building
    2. Aborts any pending calendar transitions
    3. Updates the occupancy state with MANUAL source
    """
    target_status = override.status.upper()
    
    # Validate target status
    if target_status not in ("ACTIVE", "IN_MEETING"):
        raise HTTPException(
            status_code=400, 
            detail="Status must be ACTIVE (At Desk) or IN_MEETING (Away/In Meeting)"
        )
    
    # Get current occupancy state
    result = await db.execute(
        select(OccupancyState).where(OccupancyState.employee_id == current_user.employee_id)
    )
    occupancy_state = result.scalar_one_or_none()
    
    if not occupancy_state:
        raise HTTPException(status_code=404, detail="No occupancy state found. Please scan in first.")
    
    # Cannot override if outside the building
    if occupancy_state.current_status == "OUTSIDE":
        raise HTTPException(
            status_code=400, 
            detail="Cannot override status while outside the building. Scan in first."
        )
    
    previous_status = occupancy_state.current_status
    now = datetime.now(timezone.utc)
    
    # Abort any pending calendar transitions (Manual > Calendar in hierarchy)
    aborted = await abort_pending_transitions(db, current_user.employee_id, "MANUAL_OVERRIDE")
    if aborted > 0:
        logger.info(f"Manual override aborted {aborted} pending transition(s)")
    
    # Update the status
    occupancy_state.current_status = target_status
    occupancy_state.last_state_change = now
    occupancy_state.last_change_source = "MANUAL"
    
    # Log the status transition for time-tracking (FR4)
    await log_status_change(
        db=db,
        employee_id=current_user.employee_id,
        from_status=previous_status,
        to_status=target_status,
        source="MANUAL",
        changed_at=now,
    )
    
    await db.commit()
    
    logger.info(f"Manual status override: {current_user.employee.full_name} {previous_status} -> {target_status}")
    
    # Broadcast to dashboards
    await broadcast_to_dashboards({
        "type": "STATUS_CHANGE",
        "employee_id": str(current_user.employee_id),
        "previous_status": previous_status,
        "new_status": target_status,
        "source": "MANUAL",
        "timestamp": now.isoformat(),
    })
    
    return StatusOverrideResponse(
        employee_id=current_user.employee_id,
        previous_status=previous_status,
        new_status=target_status,
        change_source="MANUAL",
        changed_at=now,
    )


async def _get_or_create_calendar_settings(
    db: AsyncSession,
    employee_id: uuid.UUID,
) -> EmployeeCalendarSettings:
    result = await db.execute(
        select(EmployeeCalendarSettings).where(EmployeeCalendarSettings.employee_id == employee_id)
    )
    settings_row = result.scalar_one_or_none()
    if settings_row:
        return settings_row

    settings_row = EmployeeCalendarSettings(
        employee_id=employee_id,
        provider="NONE",
        is_enabled=False,
        sync_enabled=False,
        auto_transition_enabled=True,
    )
    db.add(settings_row)
    await db.flush()
    return settings_row


async def _get_or_create_timezone_preferences(
    db: AsyncSession,
    employee_id: uuid.UUID,
) -> EmployeeTimezonePreference:
    result = await db.execute(
        select(EmployeeTimezonePreference).where(EmployeeTimezonePreference.employee_id == employee_id)
    )
    pref = result.scalar_one_or_none()
    if pref:
        return pref

    pref = EmployeeTimezonePreference(
        employee_id=employee_id,
        client_timezone=settings.OFFICE_TIMEZONE,
        organization_timezone=settings.OFFICE_TIMEZONE,
    )
    db.add(pref)
    await db.flush()
    return pref


def _serialize_special_meeting(meeting: SpecialMeeting) -> SpecialMeetingResponse:
    return SpecialMeetingResponse(
        meeting_id=meeting.meeting_id,
        title=meeting.title,
        notes=meeting.notes,
        start_at_utc=meeting.start_at_utc,
        start_at_local=_to_local(meeting.start_at_utc, meeting.timezone),
        timezone=meeting.timezone,
        organization_timezone=meeting.organization_timezone,
        duration_min=meeting.duration_min,
        is_important=meeting.is_important,
        status=meeting.status,
        notified_count=0,
        triggered_at=meeting.triggered_at,
        created_at=meeting.created_at,
    )


async def _get_important_employee_ids(db: AsyncSession) -> List[uuid.UUID]:
    result = await db.execute(
        select(UserAccount.employee_id)
        .join(Role, Role.role_id == UserAccount.role_id)
        .where(
            UserAccount.is_active == True,  # noqa: E712
            Role.name.in_(["SUPER_ADMIN", "HR_MANAGER", "MANAGER"]),
        )
    )
    return list({row[0] for row in result.all()})


@router.get("/calendar-settings", response_model=CalendarSettingsResponse)
async def get_calendar_settings(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    calendar_settings = await _get_or_create_calendar_settings(db, current_user.employee_id)
    timezone_pref = await _get_or_create_timezone_preferences(db, current_user.employee_id)

    return CalendarSettingsResponse(
        settings_id=calendar_settings.settings_id,
        employee_id=calendar_settings.employee_id,
        provider=calendar_settings.provider,
        is_enabled=calendar_settings.is_enabled,
        sync_enabled=calendar_settings.sync_enabled,
        auto_transition_enabled=calendar_settings.auto_transition_enabled,
        timezone=timezone_pref.client_timezone,
        organization_timezone=timezone_pref.organization_timezone,
        ical_url=calendar_settings.ical_url,
        last_sync_at=calendar_settings.last_sync_at,
        sync_error=calendar_settings.sync_error,
    )


@router.put("/calendar-settings", response_model=CalendarSettingsResponse)
async def update_calendar_settings(
    payload: CalendarSettingsUpdate,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed_providers = {"NONE", "GOOGLE", "MICROSOFT", "ICAL"}
    if payload.provider and payload.provider.upper() not in allowed_providers:
        raise HTTPException(status_code=400, detail="Invalid calendar provider")

    calendar_settings = await _get_or_create_calendar_settings(db, current_user.employee_id)
    timezone_pref = await _get_or_create_timezone_preferences(db, current_user.employee_id)

    if payload.provider is not None:
        calendar_settings.provider = payload.provider.upper()
    if payload.is_enabled is not None:
        calendar_settings.is_enabled = payload.is_enabled
    if payload.sync_enabled is not None:
        calendar_settings.sync_enabled = payload.sync_enabled
    if payload.auto_transition_enabled is not None:
        calendar_settings.auto_transition_enabled = payload.auto_transition_enabled
    if payload.ical_url is not None:
        calendar_settings.ical_url = payload.ical_url

    if calendar_settings.provider != "ICAL":
        calendar_settings.ical_url = None

    if payload.timezone is not None:
        timezone_pref.client_timezone = payload.timezone
    if payload.organization_timezone is not None:
        timezone_pref.organization_timezone = payload.organization_timezone
    if not timezone_pref.organization_timezone:
        timezone_pref.organization_timezone = settings.OFFICE_TIMEZONE

    await db.flush()
    return CalendarSettingsResponse(
        settings_id=calendar_settings.settings_id,
        employee_id=calendar_settings.employee_id,
        provider=calendar_settings.provider,
        is_enabled=calendar_settings.is_enabled,
        sync_enabled=calendar_settings.sync_enabled,
        auto_transition_enabled=calendar_settings.auto_transition_enabled,
        timezone=timezone_pref.client_timezone,
        organization_timezone=timezone_pref.organization_timezone,
        ical_url=calendar_settings.ical_url,
        last_sync_at=calendar_settings.last_sync_at,
        sync_error=calendar_settings.sync_error,
    )


@router.get(
    "/special-meetings",
    response_model=List[SpecialMeetingResponse],
    dependencies=[Depends(require_roles(["SUPER_ADMIN", "HR_MANAGER", "MANAGER"]))],
)
async def list_special_meetings(
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    rows = (
        await db.execute(
            select(SpecialMeeting)
            .where(SpecialMeeting.created_by_employee_id == current_user.employee_id)
            .order_by(SpecialMeeting.start_at_utc.desc())
        )
    ).scalars().all()
    return [_serialize_special_meeting(m) for m in rows]


@router.post(
    "/special-meetings",
    response_model=SpecialMeetingResponse,
    dependencies=[Depends(require_roles(["SUPER_ADMIN", "HR_MANAGER", "MANAGER"]))],
)
async def create_special_meeting(
    payload: SpecialMeetingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    time_pref = await _get_or_create_timezone_preferences(db, current_user.employee_id)
    org_tz = time_pref.organization_timezone or settings.OFFICE_TIMEZONE
    start_utc = _to_utc(payload.start_at, payload.timezone)

    meeting = SpecialMeeting(
        created_by_employee_id=current_user.employee_id,
        title=payload.title.strip(),
        notes=payload.notes,
        start_at_utc=start_utc,
        timezone=payload.timezone or settings.OFFICE_TIMEZONE,
        organization_timezone=org_tz,
        duration_min=payload.duration_min,
        is_important=payload.is_important,
        status="SCHEDULED",
        target_roles=["SUPER_ADMIN", "HR_MANAGER", "MANAGER"],
    )
    db.add(meeting)
    await db.flush()

    target_ids = await _get_important_employee_ids(db)
    if current_user.employee_id not in target_ids:
        target_ids.append(current_user.employee_id)

    for employee_id in target_ids:
        db.add(Notification(
            recipient_id=employee_id,
            title=f"Special Meeting Scheduled: {meeting.title}",
            message=(
                f"Starts at {_to_local(start_utc, meeting.timezone).strftime('%Y-%m-%d %H:%M %Z')} "
                f"({meeting.timezone}) | Factory time: {_to_local(start_utc, meeting.organization_timezone).strftime('%Y-%m-%d %H:%M %Z')}"
            ),
            type="MEETING_TRANSITION",
            channel="IN_APP",
            priority="HIGH",
            delivery_status="DELIVERED",
            is_actionable=False,
        ))

    response = _serialize_special_meeting(meeting)
    response.notified_count = len(target_ids)
    return response


@router.post(
    "/special-meetings/{meeting_id}/trigger",
    response_model=MessageResponse,
    dependencies=[Depends(require_roles(["SUPER_ADMIN", "HR_MANAGER", "MANAGER"]))],
)
async def trigger_special_meeting(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    result = await db.execute(
        select(SpecialMeeting).where(SpecialMeeting.meeting_id == meeting_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Special meeting not found")

    if meeting.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot trigger a cancelled meeting")

    target_ids = await _get_important_employee_ids(db)
    transitions_created = 0

    for employee_id in target_ids:
        state_result = await db.execute(
            select(OccupancyState).where(OccupancyState.employee_id == employee_id)
        )
        occupancy_state = state_result.scalar_one_or_none()
        if not occupancy_state or occupancy_state.current_status in ("OUTSIDE", "IN_MEETING"):
            continue

        pending_result = await db.execute(
            select(PendingStateTransition).where(
                and_(
                    PendingStateTransition.employee_id == employee_id,
                    PendingStateTransition.status == "PENDING",
                )
            )
        )
        if pending_result.scalar_one_or_none():
            continue

        await create_meeting_transition(
            db=db,
            employee_id=employee_id,
            calendar_event_id=str(meeting.meeting_id),
            calendar_event_title=f"[SPECIAL] {meeting.title}",
            current_status=occupancy_state.current_status,
        )
        transitions_created += 1

    meeting.status = "TRIGGERED"
    meeting.triggered_at = datetime.now(timezone.utc)

    return MessageResponse(
        message=f"Triggered special meeting for {transitions_created} important employee(s)",
        detail=f"Meeting: {meeting.title}",
    )


# ==================== CALENDAR SYNC TRIGGER (For Background Job / External Caller) ====================

@router.post("/trigger-meeting-transition", response_model=PendingTransitionResponse)
async def trigger_meeting_transition(
    employee_id: uuid.UUID,
    calendar_event_id: Optional[str] = None,
    calendar_event_title: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger a meeting transition for an employee (called by calendar sync service).
    
    This creates a PendingStateTransition with the 30-second rule:
    - If employee confirms: immediately transition to IN_MEETING
    - If employee cancels: stay at current status
    - If timeout (30s): auto-confirm and transition to IN_MEETING
    
    Note: This endpoint should be protected by internal API key in production.
    """
    # Get employee's current occupancy state
    result = await db.execute(
        select(OccupancyState).where(OccupancyState.employee_id == employee_id)
    )
    occupancy_state = result.scalar_one_or_none()
    
    if not occupancy_state:
        raise HTTPException(status_code=404, detail="Employee has no occupancy state")
    
    # Only trigger if employee is inside the building
    if occupancy_state.current_status == "OUTSIDE":
        raise HTTPException(
            status_code=400, 
            detail="Employee is outside the building. No transition needed."
        )
    
    # Don't trigger if already in meeting
    if occupancy_state.current_status == "IN_MEETING":
        raise HTTPException(
            status_code=400, 
            detail="Employee is already in a meeting."
        )
    
    # Check for existing pending transition
    existing_result = await db.execute(
        select(PendingStateTransition).where(
            and_(
                PendingStateTransition.employee_id == employee_id,
                PendingStateTransition.status == "PENDING"
            )
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=400, 
            detail="Employee already has a pending transition."
        )
    
    # Create the pending transition with 30-second rule
    transition = await create_meeting_transition(
        db=db,
        employee_id=employee_id,
        calendar_event_id=calendar_event_id,
        calendar_event_title=calendar_event_title,
        current_status=occupancy_state.current_status,
    )
    
    await db.commit()
    
    now = datetime.now(timezone.utc)
    return PendingTransitionResponse(
        transition_id=transition.transition_id,
        employee_id=transition.employee_id,
        trigger_source=transition.trigger_source,
        calendar_event_title=transition.calendar_event_title,
        from_status=transition.from_status,
        to_status=transition.to_status,
        triggered_at=transition.triggered_at,
        expires_at=transition.expires_at,
        seconds_remaining=TRANSITION_TIMEOUT_SECONDS,
        status=transition.status,
        notification_id=transition.notification_id,
    )


async def process_expired_transitions(db: AsyncSession) -> int:
    """
    Process all expired pending transitions (auto-confirm after 30 seconds).
    This should be called by a background task/scheduler.
    Returns the count of auto-confirmed transitions.
    """
    now = datetime.now(timezone.utc)
    
    result = await db.execute(
        select(PendingStateTransition).where(
            and_(
                PendingStateTransition.status == "PENDING",
                PendingStateTransition.expires_at <= now
            )
        )
    )
    expired = result.scalars().all()
    
    auto_confirmed = 0
    for transition in expired:
        # Get employee's occupancy state
        state_result = await db.execute(
            select(OccupancyState).where(OccupancyState.employee_id == transition.employee_id)
        )
        occupancy_state = state_result.scalar_one_or_none()
        
        # Only auto-confirm if employee is still inside (not scanned out)
        if occupancy_state and occupancy_state.current_status != "OUTSIDE":
            previous_status = occupancy_state.current_status
            transition.status = "AUTO_CONFIRMED"
            transition.resolution_source = "TIMEOUT"
            transition.resolved_at = now
            
            occupancy_state.current_status = "IN_MEETING"
            occupancy_state.last_state_change = now
            occupancy_state.last_change_source = "CALENDAR_SYNC"
            
            # Log the status transition for time-tracking (FR4)
            await log_status_change(
                db=db,
                employee_id=transition.employee_id,
                from_status=previous_status,
                to_status="IN_MEETING",
                source="AUTO_CONFIRM",
                changed_at=now,
            )
            
            auto_confirmed += 1
            logger.info(f"Auto-confirmed meeting transition for employee {transition.employee_id}")
            
            # Broadcast status change
            await broadcast_to_dashboards({
                "type": "STATUS_CHANGE",
                "employee_id": str(transition.employee_id),
                "new_status": "IN_MEETING",
                "source": "CALENDAR_AUTO",
                "timestamp": now.isoformat(),
            })
        else:
            # Employee scanned out, abort the transition
            transition.status = "ABORTED"
            transition.resolution_source = "EMPLOYEE_LEFT"
            transition.resolved_at = now
        
        # Update notification
        if transition.notification_id:
            notif_result = await db.execute(
                select(Notification).where(Notification.notification_id == transition.notification_id)
            )
            notification = notif_result.scalar_one_or_none()
            if notification:
                notification.action_taken = "TIMEOUT" if transition.status == "AUTO_CONFIRMED" else "ABORTED"
                notification.action_taken_at = now
    
    await db.commit()
    return auto_confirmed
