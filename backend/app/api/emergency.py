from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.employee import UserAccount
from app.models.emergency import EmergencyEvent, EmergencyHeadcount
from app.models.events import OccupancyState
from app.api.schemas import (
    EmergencyEventCreate,
    EmergencyEventResponse,
    EmergencyHeadcountResponse,
    MessageResponse
)

router = APIRouter(prefix="/api/emergency", tags=["Emergency"])

@router.post("/trigger", response_model=EmergencyEventResponse)
async def trigger_emergency(
    data: EmergencyEventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """FR9: Super Admin or HR triggers emergency evacuation mode."""
    if current_user.role.name not in ["SUPER_ADMIN", "HR_MANAGER"]:
        raise HTTPException(status_code=403, detail="Only Admins & HR can trigger emergencies")

    # Check if an active emergency exists
    active = await db.execute(select(EmergencyEvent).where(EmergencyEvent.status == "ACTIVE"))
    if active.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An emergency is already active!")

    # 1. Create Event
    ev = EmergencyEvent(
        activated_by=current_user.employee_id,
        emergency_type=data.emergency_type,
        notes=data.notes,
        status="ACTIVE"
    )
    db.add(ev)
    await db.flush()

    # 2. Get headcount of everyone currently inside or recently stepped out
    # ACTIVE + IN_MEETING = physically inside the building
    # ON_BREAK = scanned out recently, may still be nearby
    occupancy_res = await db.execute(
        select(OccupancyState)
        .where(OccupancyState.current_status.in_(["ACTIVE", "IN_MEETING", "ON_BREAK"]))
    )
    inside_occupants = occupancy_res.scalars().all()
    ev.headcount_at_activation = len(inside_occupants)

    # 3. Create Headcount snapshots
    for occ in inside_occupants:
        hc = EmergencyHeadcount(
            emergency_id=ev.emergency_id,
            employee_id=occ.employee_id,
            status_at_event=occ.current_status,
            accounted_for=False
        )
        db.add(hc)

    await db.commit()

    # 4. Return complete response
    result = await db.execute(
        select(EmergencyEvent)
        .options(joinedload(EmergencyEvent.activator), joinedload(EmergencyEvent.headcount_entries).joinedload(EmergencyHeadcount.employee))
        .where(EmergencyEvent.emergency_id == ev.emergency_id)
    )
    saved_ev = result.unique().scalar_one()

    # Dispatch universal notification here if Notifications supported global broadcast
    
    return _format_emergency_response(saved_ev)


@router.get("/active", response_model=Optional[EmergencyEventResponse])
async def get_active_emergency(db: AsyncSession = Depends(get_db)):
    """Fetch the currently active emergency."""
    result = await db.execute(
        select(EmergencyEvent)
        .options(joinedload(EmergencyEvent.activator), joinedload(EmergencyEvent.headcount_entries).joinedload(EmergencyHeadcount.employee))
        .where(EmergencyEvent.status == "ACTIVE")
    )
    ev = result.unique().scalar_one_or_none()
    return _format_emergency_response(ev) if ev else None


@router.get("/", response_model=List[EmergencyEventResponse])
async def list_emergencies(db: AsyncSession = Depends(get_db)):
    """List historical emergencies."""
    result = await db.execute(
        select(EmergencyEvent)
        .options(joinedload(EmergencyEvent.activator), joinedload(EmergencyEvent.headcount_entries).joinedload(EmergencyHeadcount.employee))
        .order_by(EmergencyEvent.activation_time.desc())
    )
    events = result.unique().scalars().all()
    return [_format_emergency_response(ev) for ev in events]


@router.put("/{emergency_id}/resolve", response_model=MessageResponse)
async def resolve_emergency(
    emergency_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    if current_user.role.name not in ["SUPER_ADMIN", "HR_MANAGER"]:
        raise HTTPException(status_code=403, detail="Permission denied")

    result = await db.execute(select(EmergencyEvent).where(EmergencyEvent.emergency_id == emergency_id))
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Emergency not found")

    ev.status = "RESOLVED"
    ev.deactivation_time = datetime.now(timezone.utc)
    await db.commit()
    return MessageResponse(message="Emergency resolved")


@router.put("/headcount/{headcount_id}/account", response_model=MessageResponse)
async def account_for_employee(
    headcount_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """Muster point operator marks employee as safe."""
    result = await db.execute(select(EmergencyHeadcount).where(EmergencyHeadcount.id == headcount_id))
    hc = result.scalar_one_or_none()
    if not hc:
        raise HTTPException(status_code=404, detail="Headcount entry not found")

    hc.accounted_for = True
    hc.accounted_at = datetime.now(timezone.utc)
    await db.commit()
    return MessageResponse(message="Employee marked as safe.")


def _format_emergency_response(ev: EmergencyEvent) -> EmergencyEventResponse:
    entries = []
    for hc in ev.headcount_entries:
        entries.append(EmergencyHeadcountResponse(
            id=hc.id,
            employee_id=hc.employee_id,
            employee_name=f"{hc.employee.first_name} {hc.employee.last_name}",
            status_at_event=hc.status_at_event,
            accounted_for=hc.accounted_for,
            last_known_door=hc.last_known_door,
            accounted_at=hc.accounted_at
        ))
        
    return EmergencyEventResponse(
        emergency_id=ev.emergency_id,
        activated_by=ev.activated_by,
        activator_name=f"{ev.activator.first_name} {ev.activator.last_name}",
        activation_time=ev.activation_time,
        deactivation_time=ev.deactivation_time,
        emergency_type=ev.emergency_type,
        headcount_at_activation=ev.headcount_at_activation,
        notes=ev.notes,
        status=ev.status,
        headcount_entries=entries
    )
