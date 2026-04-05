"""
Scan Event API — FR1 (Biometric Event Listener) + FR2 (Occupancy Engine).
The heart of the system: receives scans, toggles state, updates occupancy.
"""
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from typing import List
import uuid
import json
import logging

from app.core.database import get_db
from app.core.security import hash_fingerprint
from app.models.employee import Employee
from app.models.events import ScanEvent, OccupancyState
from app.models.hardware import Scanner
from app.api.schemas import ScanEventRequest, ScanEventResponse, OccupancyOverview, EmployeeOccupancyState
from app.core.config import settings

router = APIRouter(prefix="/api/events", tags=["Scan Events"])
logger = logging.getLogger(__name__)

# WebSocket connections for live dashboard (FR3.3)
dashboard_connections: List[WebSocket] = []

DUPLICATE_SCAN_THRESHOLD_SECONDS = 10


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
    state_result = await db.execute(
        select(OccupancyState).where(OccupancyState.employee_id == employee.employee_id)
    )
    occupancy_state = state_result.scalar_one_or_none()
    
    if occupancy_state is None:
        # First scan ever — create state, direction is IN
        direction = "IN"
        occupancy_state = OccupancyState(
            employee_id=employee.employee_id,
            current_status="ACTIVE",
            last_state_change=scan_time,
        )
        db.add(occupancy_state)
    else:
        # Toggle based on current status
        if occupancy_state.current_status in ("ACTIVE", "ON_BREAK", "AWAY"):
            # Was inside or on break → this scan means EXIT
            direction = "OUT"
            occupancy_state.current_status = "ON_BREAK"  # Will transition to AWAY after threshold
        else:
            # Was outside → this scan means ENTRY
            direction = "IN"
            occupancy_state.current_status = "ACTIVE"
        
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
    """FR2.4: Get current real-time occupancy overview."""
    
    # Count by status
    result = await db.execute(
        select(
            OccupancyState.current_status,
            func.count(OccupancyState.state_id),
        ).group_by(OccupancyState.current_status)
    )
    counts = {row[0]: row[1] for row in result.all()}
    
    active = counts.get("ACTIVE", 0)
    on_break = counts.get("ON_BREAK", 0)
    away = counts.get("AWAY", 0)
    outside = counts.get("OUTSIDE", 0)
    total_inside = active + on_break  # ON_BREAK employees are still "around"
    
    return OccupancyOverview(
        total_inside=total_inside,
        total_capacity=settings.OFFICE_CAPACITY,
        occupancy_percentage=round((total_inside / settings.OFFICE_CAPACITY) * 100, 1) if settings.OFFICE_CAPACITY > 0 else 0,
        active_count=active,
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
