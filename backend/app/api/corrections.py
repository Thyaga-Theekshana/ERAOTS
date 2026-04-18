from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.employee import UserAccount, Employee, Department
from app.models.corrections import CorrectionRequest
from app.models.events import ScanEvent
from app.models.policies import Policy
from app.api.schemas import (
    CorrectionRequestCreate,
    CorrectionRequestResponse,
    MessageResponse
)

router = APIRouter(prefix="/api/corrections", tags=["Corrections"])


async def _get_effective_correction_window_days(
    db: AsyncSession,
    department_id: Optional[uuid.UUID],
) -> int:
    if department_id:
        dep_policy = (
            await db.execute(
                select(Policy).where(
                    Policy.policy_type == "CORRECTION_WINDOW",
                    Policy.department_id == department_id,
                    Policy.is_active == True,
                )
            )
        ).scalars().first()
        if dep_policy and isinstance(dep_policy.value, dict):
            return int(dep_policy.value.get("days", 7))

    global_policy = (
        await db.execute(
            select(Policy).where(
                Policy.policy_type == "CORRECTION_WINDOW",
                Policy.department_id.is_(None),
                Policy.is_active == True,
            )
        )
    ).scalars().first()
    if global_policy and isinstance(global_policy.value, dict):
        return int(global_policy.value.get("days", 7))

    return 7

def build_response(r: CorrectionRequest) -> CorrectionRequestResponse:
    m_name = f"{r.manager.first_name} {r.manager.last_name}" if getattr(r, 'manager', None) else None
    hr_name = f"{r.hr_admin.first_name} {r.hr_admin.last_name}" if getattr(r, 'hr_admin', None) else None
    e_name = f"{r.employee.first_name} {r.employee.last_name}" if getattr(r, 'employee', None) else None
    return CorrectionRequestResponse(
        request_id=r.correction_id,
        employee_id=r.employee_id,
        employee_name=e_name,
        correction_date=r.correction_date,
        correction_type=r.correction_type,
        status=r.status,
        reason=r.reason,
        proposed_time=r.proposed_time,
        manager_id=r.manager_id,
        manager_name=m_name,
        manager_comment=r.manager_comment,
        hr_id=r.hr_id,
        hr_name=hr_name,
        hr_comment=r.hr_comment,
        created_at=r.created_at
    )

@router.post("/", response_model=CorrectionRequestResponse)
async def submit_correction(
    data: CorrectionRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """FR14: Employee submits a correction request."""
    correction_window_days = await _get_effective_correction_window_days(
        db,
        current_user.employee.department_id if current_user.employee else None,
    )
    window_start = datetime.now(timezone.utc).date() - timedelta(days=correction_window_days)
    if data.correction_date < window_start:
        raise HTTPException(
            status_code=400,
            detail=f"Corrections are only allowed for the past {correction_window_days} days.",
        )
        
    if data.proposed_time.date() != data.correction_date:
        raise HTTPException(status_code=400, detail="Proposed time must be on the correction date.")

    # Validation: No duplicate pending requests
    existing = await db.execute(
        select(CorrectionRequest).where(
            and_(
                CorrectionRequest.employee_id == current_user.employee_id,
                CorrectionRequest.correction_date == data.correction_date,
                CorrectionRequest.status == "PENDING"
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A pending correction request already exists for this date.")

    req = CorrectionRequest(
        employee_id=current_user.employee_id,
        correction_date=data.correction_date,
        correction_type=data.correction_type.upper(),
        proposed_time=data.proposed_time,
        reason=data.reason,
        status="PENDING"
    )
    db.add(req)
    await db.flush()
    
    result = await db.execute(
        select(CorrectionRequest)
        .options(joinedload(CorrectionRequest.employee), joinedload(CorrectionRequest.manager), joinedload(CorrectionRequest.hr_admin))
        .where(CorrectionRequest.correction_id == req.correction_id)
    )
    saved_req = result.scalar_one()

    # Notify Manager
    emp = saved_req.employee
    if emp and emp.department_id:
        dept = await db.execute(select(Department).where(Department.department_id == emp.department_id))
        dept = dept.scalar_one_or_none()
        if dept and dept.manager_id:
            m_acc = await db.execute(select(UserAccount).where(UserAccount.employee_id == dept.manager_id))
            m_acc = m_acc.scalar_one_or_none()
            if m_acc:
                from app.core.notifications import dispatch_notification
                await dispatch_notification(
                    db=db,
                    user_id=m_acc.user_id,
                    title="New Correction Request",
                    message=f"{emp.first_name} {emp.last_name} submitted a correction request for {data.correction_date}.",
                    notification_type="CORRECTION_UPDATE"
                )

    return build_response(saved_req)

@router.get("/my", response_model=List[CorrectionRequestResponse])
async def my_corrections(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """Employee specific requests."""
    stmt = select(CorrectionRequest).options(joinedload(CorrectionRequest.employee), joinedload(CorrectionRequest.manager), joinedload(CorrectionRequest.hr_admin))
    stmt = stmt.where(CorrectionRequest.employee_id == current_user.employee_id)
    if status:
        stmt = stmt.where(CorrectionRequest.status == status.upper())
    stmt = stmt.order_by(CorrectionRequest.created_at.desc())
    results = (await db.execute(stmt)).scalars().all()
    return [build_response(r) for r in results]

@router.get("/", response_model=List[CorrectionRequestResponse])
async def list_corrections(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """List corrections for Manager or HR."""
    stmt = select(CorrectionRequest).options(joinedload(CorrectionRequest.employee), joinedload(CorrectionRequest.manager), joinedload(CorrectionRequest.hr_admin))
    
    # Check if HR
    if current_user.role.name in ["HR_MANAGER", "SUPER_ADMIN"]:
        pass # Can see all
    else:
        # Check if Manager
        emp = await db.execute(select(Employee).where(Employee.employee_id == current_user.employee_id))
        emp = emp.scalar_one()
        dept = await db.execute(select(Department).where(Department.manager_id == emp.employee_id))
        dept = dept.scalar_one_or_none()
        
        if dept:
            stmt = stmt.join(Employee, CorrectionRequest.employee_id == Employee.employee_id).where(Employee.department_id == dept.department_id)
        else:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
            
    if status:
        stmt = stmt.where(CorrectionRequest.status == status.upper())
        
    stmt = stmt.order_by(CorrectionRequest.created_at.desc())
    results = (await db.execute(stmt)).scalars().all()
    return [build_response(r) for r in results]

async def _get_request(db, request_id: uuid.UUID, allowed_statuses: List[str]):
    req = await db.execute(select(CorrectionRequest).where(CorrectionRequest.correction_id == request_id))
    req = req.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Correction request not found")
    if req.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Request is in {req.status} state, requires {allowed_statuses}")
    return req

async def _notify_employee(db, employee_id, title, message):
    uacc = await db.execute(select(UserAccount).where(UserAccount.employee_id == employee_id))
    uacc = uacc.scalar_one_or_none()
    if uacc:
        from app.core.notifications import dispatch_notification
        await dispatch_notification(db, uacc.user_id, title, message, "CORRECTION_UPDATE")

@router.put("/{request_id}/manager-approve", response_model=MessageResponse)
async def manager_approve(
    request_id: uuid.UUID,
    comment: Optional[str] = Query(None, description="Manager comment"),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    req = await _get_request(db, request_id, ["PENDING"])
    req.status = "MANAGER_APPROVED"
    req.manager_id = current_user.employee_id
    req.manager_comment = comment
    req.manager_reviewed_at = datetime.now(timezone.utc)
    
    # Notify HR
    hr_users = await db.execute(select(UserAccount).join(UserAccount.role).where(UserAccount.role.name == "HR_MANAGER"))
    from app.core.notifications import dispatch_notification
    for hr in hr_users.scalars().all():
        await dispatch_notification(db, hr.user_id, "Correction Request Manager Approved", f"A correction request for {req.correction_date} is pending HR approval.", "CORRECTION_UPDATE")

    return MessageResponse(message="Request manager approved.")

@router.put("/{request_id}/manager-reject", response_model=MessageResponse)
async def manager_reject(
    request_id: uuid.UUID,
    comment: str = Query(..., description="Manager reason for rejection"),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    req = await _get_request(db, request_id, ["PENDING"])
    req.status = "REJECTED"
    req.manager_id = current_user.employee_id
    req.manager_comment = comment
    req.manager_reviewed_at = datetime.now(timezone.utc)
    
    await _notify_employee(db, req.employee_id, "Correction Request Rejected", f"Your request was rejected by your manager. Reason: {comment}")
    return MessageResponse(message="Request rejected.")

@router.put("/{request_id}/hr-approve", response_model=MessageResponse)
async def hr_approve(
    request_id: uuid.UUID,
    comment: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    if current_user.role.name not in ["HR_MANAGER", "SUPER_ADMIN"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
        
    req = await _get_request(db, request_id, ["MANAGER_APPROVED"])
    req.status = "COMPLETED"
    req.hr_id = current_user.employee_id
    req.hr_comment = comment
    req.hr_reviewed_at = datetime.now(timezone.utc)
    
    direction = "IN" if req.correction_type == "MISSED_IN" else "OUT"
    if req.correction_type == "MISSED_SCAN":
        direction = "IN" if req.proposed_time.hour < 12 else "OUT"

    # Create synthetic manual scan
    synthetic_event = ScanEvent(
        employee_id=req.employee_id,
        scanner_id=None,
        fingerprint_hash="MANUAL_CORRECTION",
        scan_timestamp=req.proposed_time,
        direction=direction,
        is_valid=True
    )
    db.add(synthetic_event)
    await db.flush()
    
    req.created_event_id = synthetic_event.event_id
    
    # Process attendance recalculation
    from app.core.attendance_processor import process_daily_attendance
    await process_daily_attendance(db, req.correction_date, req.employee_id)

    await _notify_employee(db, req.employee_id, "Correction Request Approved", "Your correction request has been approved by HR and your attendance has been recalculated.")
    return MessageResponse(message="Request HR approved.")

@router.put("/{request_id}/hr-reject", response_model=MessageResponse)
async def hr_reject(
    request_id: uuid.UUID,
    comment: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    if current_user.role.name not in ["HR_MANAGER", "SUPER_ADMIN"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
        
    req = await _get_request(db, request_id, ["MANAGER_APPROVED"])
    req.status = "REJECTED"
    req.hr_id = current_user.employee_id
    req.hr_comment = comment
    req.hr_reviewed_at = datetime.now(timezone.utc)
    
    await _notify_employee(db, req.employee_id, "Correction Request Rejected", f"Your request was rejected by HR. Reason: {comment}")
    return MessageResponse(message="Request rejected.")
