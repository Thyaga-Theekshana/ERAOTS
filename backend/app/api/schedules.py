from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.orm import joinedload
from typing import List, Optional
from datetime import date, datetime, timezone
import uuid

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.employee import UserAccount, Department
from app.models.schedule import LeaveRequest, LeaveType, Schedule, EmployeeSchedule, Holiday
from app.api.schemas import (
    LeaveRequestCreate,
    LeaveRequestResponse,
    LeaveUsageSummary,
    LeaveCalendarEntry,
    LeaveHolidayEntry,
    MessageResponse
)
from app.api.reports import generate_csv, generate_pdf

router = APIRouter(prefix="/api/schedules", tags=["Schedules & Leave"])
_leave_schema_ensured = False


async def _ensure_leave_schema(db: AsyncSession) -> None:
    global _leave_schema_ensured
    if _leave_schema_ensured:
        return
    await db.execute(text("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS is_half_day BOOLEAN NOT NULL DEFAULT FALSE"))
    await db.execute(text("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS half_day_session VARCHAR(2)"))
    _leave_schema_ensured = True


def _is_weekend(day: date) -> bool:
    return day.weekday() >= 5


def _compute_effective_leave_days(
    start_date: date,
    end_date: date,
    holiday_dates: set[date],
    is_half_day: bool = False,
) -> float:
    total_days = 0.0
    cursor = start_date
    while cursor <= end_date:
        if not _is_weekend(cursor) and cursor not in holiday_dates:
            total_days += 1.0
        cursor = date.fromordinal(cursor.toordinal() + 1)

    if is_half_day:
        return 0.5 if total_days >= 1 else 0.0
    return total_days

# ==================== SCHEDULES ====================

@router.get("/")
async def list_schedules(
    department_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """List all schedules. Optionally filter by department."""
    stmt = select(Schedule).options(joinedload(Schedule.department))
    
    if department_id:
        stmt = stmt.where(Schedule.department_id == department_id)
    
    results = (await db.execute(stmt)).scalars().all()
    
    return [
        {
            "schedule_id": str(s.schedule_id),
            "name": s.name,
            "department_id": str(s.department_id) if s.department_id else None,
            "department_name": s.department.name if s.department else None,
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "end_time": s.end_time.isoformat() if s.end_time else None,
            "break_duration": s.break_duration_minutes,
            "is_active": s.is_active,
        }
        for s in results
    ]


@router.get("/my-schedule")
async def get_my_schedule(
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """Get current user's work schedule assignments."""
    # Get employee schedules
    stmt = select(EmployeeSchedule).options(
        joinedload(EmployeeSchedule.schedule)
    ).where(EmployeeSchedule.employee_id == current_user.employee_id)
    
    results = (await db.execute(stmt)).unique().scalars().all()
    
    schedules = []
    for es in results:
        if es.schedule:
            schedules.append({
                "schedule_id": str(es.schedule.schedule_id),
                "schedule_name": es.schedule.name,
                "day_of_week": es.day_of_week,
                "start_time": es.schedule.start_time.isoformat() if es.schedule.start_time else None,
                "end_time": es.schedule.end_time.isoformat() if es.schedule.end_time else None,
                "break_duration": es.schedule.break_duration_minutes,
            })
    
    return schedules

# ==================== LEAVE TYPES ====================

@router.get("/leave-types")
async def get_leave_types(db: AsyncSession = Depends(get_db)):
    """Fetch all available leave types for the form dropdown."""
    results = await db.execute(select(LeaveType))
    types = results.scalars().all()
    # If empty (unseeded), mock some dynamically
    if not types:
        lt1 = LeaveType(name="Annual Leave", max_days_per_year=20, is_paid=True)
        lt2 = LeaveType(name="Sick Leave", max_days_per_year=14, is_paid=True)
        lt3 = LeaveType(name="Unpaid Leave", is_paid=False, requires_approval=True)
        db.add_all([lt1, lt2, lt3])
        await db.commit()
        results = await db.execute(select(LeaveType))
        types = results.scalars().all()

    return [{"leave_type_id": str(t.leave_type_id), "name": t.name} for t in types]


@router.get("/leave-balance")
async def get_leave_balance(
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
    year: Optional[int] = None
):
    """Get current employee's leave balance (used vs remaining days by type)."""
    await _ensure_leave_schema(db)
    year = year or date.today().year
    
    # Get all leave types
    leave_types = (await db.execute(select(LeaveType))).scalars().all()
    
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)

    holiday_rows = (
        await db.execute(
            select(Holiday).where(Holiday.holiday_date >= year_start, Holiday.holiday_date <= year_end)
        )
    ).scalars().all()
    holiday_dates = {h.holiday_date for h in holiday_rows}

    # Get approved leave requests for this employee in the given year
    approved_leaves = (
        await db.execute(
            select(LeaveRequest)
            .options(joinedload(LeaveRequest.leave_type))
            .where(
                LeaveRequest.employee_id == current_user.employee_id,
                LeaveRequest.status == "APPROVED",
                LeaveRequest.end_date >= year_start,
                LeaveRequest.start_date <= year_end,
            )
        )
    ).scalars().all()
    
    # Calculate used days per type
    used_by_type = {}
    for req in approved_leaves:
        effective_start = max(req.start_date, year_start)
        effective_end = min(req.end_date, year_end)
        if effective_start > effective_end:
            continue
        leave_id = req.leave_type_id
        days = _compute_effective_leave_days(
            effective_start,
            effective_end,
            holiday_dates,
            getattr(req, "is_half_day", False),
        )
        used_by_type[leave_id] = used_by_type.get(leave_id, 0.0) + days
    
    # Build response
    balance = []
    for lt in leave_types:
        used = used_by_type.get(lt.leave_type_id, 0)
        remaining = None
        if lt.max_days_per_year is not None:
            remaining = max(0.0, float(lt.max_days_per_year) - used)
        
        balance.append({
            "leave_type_id": str(lt.leave_type_id),
            "leave_type_name": lt.name,
            "max_days": lt.max_days_per_year,
            "used_days": round(used, 2),
            "remaining_days": remaining,
            "is_paid": lt.is_paid
        })
    
    return balance


# ==================== LEAVE REQUESTS ====================

@router.post("/leave-requests", response_model=LeaveRequestResponse)
async def submit_leave_request(
    data: LeaveRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """FR8: Employee submits a new leave request."""
    await _ensure_leave_schema(db)
    if data.start_date > data.end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date")

    if data.is_half_day:
        if data.start_date != data.end_date:
            raise HTTPException(status_code=400, detail="Half-day leave must be requested for a single day")
        if data.half_day_session not in ["AM", "PM"]:
            raise HTTPException(status_code=400, detail="Half-day session must be AM or PM")

    overlap = (
        await db.execute(
            select(LeaveRequest).where(
                LeaveRequest.employee_id == current_user.employee_id,
                LeaveRequest.status.in_(["PENDING", "APPROVED"]),
                LeaveRequest.end_date >= data.start_date,
                LeaveRequest.start_date <= data.end_date,
            )
        )
    ).scalar_one_or_none()
    if overlap:
        raise HTTPException(status_code=409, detail="You already have a leave request in this date range")

    holiday_rows = (
        await db.execute(
            select(Holiday).where(
                Holiday.holiday_date >= data.start_date,
                Holiday.holiday_date <= data.end_date,
            )
        )
    ).scalars().all()
    holiday_dates = {h.holiday_date for h in holiday_rows}
    effective_days = _compute_effective_leave_days(
        data.start_date,
        data.end_date,
        holiday_dates,
        data.is_half_day,
    )
    if effective_days <= 0:
        raise HTTPException(status_code=400, detail="Selected date range contains only weekends or holidays")

    req = LeaveRequest(
        employee_id=current_user.employee_id,
        leave_type_id=data.leave_type_id,
        start_date=data.start_date,
        end_date=data.end_date,
        reason=data.reason,
        is_half_day=data.is_half_day,
        half_day_session=data.half_day_session,
        status="PENDING"
    )
    db.add(req)
    await db.flush()
    
    # Reload with relations for response
    result = await db.execute(
        select(LeaveRequest)
        .options(joinedload(LeaveRequest.leave_type), joinedload(LeaveRequest.employee))
        .where(LeaveRequest.leave_id == req.leave_id)
    )
    saved_req = result.scalar_one()

    user_account_res = await db.execute(select(UserAccount).where(UserAccount.employee_id == saved_req.employee_id))
    uacc = user_account_res.scalar_one_or_none()
    if uacc:
        from app.core.notifications import dispatch_notification
        await dispatch_notification(
            db=db,
            user_id=uacc.user_id,
            title="Leave Request Submitted",
            message=f"Your leave request ({saved_req.leave_type.name}) for {saved_req.start_date.isoformat()} to {saved_req.end_date.isoformat()} is pending review.",
            notification_type="LEAVE_UPDATE"
        )
    
    return LeaveRequestResponse(
        request_id=saved_req.leave_id,
        employee_id=saved_req.employee_id,
        employee_name=f"{saved_req.employee.first_name} {saved_req.employee.last_name}",
        leave_type_id=saved_req.leave_type_id,
        leave_type_name=saved_req.leave_type.name,
        start_date=saved_req.start_date,
        end_date=saved_req.end_date,
        status=saved_req.status,
        reason=saved_req.reason,
        is_half_day=saved_req.is_half_day,
        half_day_session=saved_req.half_day_session,
        effective_days=effective_days,
        review_comment=saved_req.review_comment,
        reviewed_at=saved_req.reviewed_at,
        created_at=saved_req.created_at
    )


@router.get("/leave-requests/my", response_model=List[LeaveRequestResponse])
async def get_my_leave_requests(
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """Get current user's leave requests."""
    await _ensure_leave_schema(db)
    stmt = select(LeaveRequest).options(
        joinedload(LeaveRequest.leave_type), 
        joinedload(LeaveRequest.employee)
    ).where(
        LeaveRequest.employee_id == current_user.employee_id
    ).order_by(LeaveRequest.created_at.desc())
    
    results = (await db.execute(stmt)).scalars().all()
    holiday_start = min((r.start_date for r in results), default=None)
    holiday_end = max((r.end_date for r in results), default=None)
    holiday_dates = set()
    if holiday_start and holiday_end:
        holiday_rows = (
            await db.execute(
                select(Holiday).where(Holiday.holiday_date >= holiday_start, Holiday.holiday_date <= holiday_end)
            )
        ).scalars().all()
        holiday_dates = {h.holiday_date for h in holiday_rows}
    
    return [
        LeaveRequestResponse(
            request_id=r.leave_id,
            employee_id=r.employee_id,
            employee_name=f"{r.employee.first_name} {r.employee.last_name}",
            leave_type_id=r.leave_type_id,
            leave_type_name=r.leave_type.name,
            start_date=r.start_date,
            end_date=r.end_date,
            status=r.status,
            reason=r.reason,
            is_half_day=r.is_half_day,
            half_day_session=r.half_day_session,
            effective_days=_compute_effective_leave_days(r.start_date, r.end_date, holiday_dates, r.is_half_day),
            review_comment=r.review_comment,
            reviewed_at=r.reviewed_at,
            created_at=r.created_at
        ) for r in results
    ]


@router.get("/leave-requests", response_model=List[LeaveRequestResponse])
async def list_leave_requests(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """FR8: List leave requests. Employees see their own; HR sees all."""
    await _ensure_leave_schema(db)
    stmt = select(LeaveRequest).options(
        joinedload(LeaveRequest.leave_type), 
        joinedload(LeaveRequest.employee)
    )
    
    # Filtering based on role
    if current_user.role.name == "EMPLOYEE":
        stmt = stmt.where(LeaveRequest.employee_id == current_user.employee_id)
        
    if status:
        stmt = stmt.where(LeaveRequest.status == status.upper())
        
    stmt = stmt.order_by(LeaveRequest.created_at.desc())
    
    results = (await db.execute(stmt)).scalars().all()
    holiday_start = min((r.start_date for r in results), default=None)
    holiday_end = max((r.end_date for r in results), default=None)
    holiday_dates = set()
    if holiday_start and holiday_end:
        holiday_rows = (
            await db.execute(
                select(Holiday).where(Holiday.holiday_date >= holiday_start, Holiday.holiday_date <= holiday_end)
            )
        ).scalars().all()
        holiday_dates = {h.holiday_date for h in holiday_rows}
    
    return [
        LeaveRequestResponse(
            request_id=r.leave_id,
            employee_id=r.employee_id,
            employee_name=f"{r.employee.first_name} {r.employee.last_name}",
            leave_type_id=r.leave_type_id,
            leave_type_name=r.leave_type.name,
            start_date=r.start_date,
            end_date=r.end_date,
            status=r.status,
            reason=r.reason,
            is_half_day=r.is_half_day,
            half_day_session=r.half_day_session,
            effective_days=_compute_effective_leave_days(r.start_date, r.end_date, holiday_dates, r.is_half_day),
            review_comment=r.review_comment,
            reviewed_at=r.reviewed_at,
            created_at=r.created_at
        ) for r in results
    ]


@router.get(
    "/leave-usage",
    response_model=List[LeaveUsageSummary],
    dependencies=[Depends(require_roles(["SUPER_ADMIN", "HR_MANAGER", "MANAGER"]))],
)
async def get_leave_usage_summary(
    year: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    """Role-limited leave usage visibility (organization-level summary)."""
    await _ensure_leave_schema(db)
    year = year or date.today().year
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    holiday_rows = (
        await db.execute(
            select(Holiday).where(Holiday.holiday_date >= year_start, Holiday.holiday_date <= year_end)
        )
    ).scalars().all()
    holiday_dates = {h.holiday_date for h in holiday_rows}

    leave_types = (await db.execute(select(LeaveType))).scalars().all()
    approved = (
        await db.execute(
            select(LeaveRequest)
            .options(joinedload(LeaveRequest.leave_type))
            .where(
                LeaveRequest.status == "APPROVED",
                LeaveRequest.end_date >= year_start,
                LeaveRequest.start_date <= year_end,
            )
        )
    ).scalars().all()

    used_by_type = {}
    for req in approved:
        effective_start = max(req.start_date, year_start)
        effective_end = min(req.end_date, year_end)
        if effective_start > effective_end:
            continue
        used_by_type[req.leave_type_id] = used_by_type.get(req.leave_type_id, 0.0) + _compute_effective_leave_days(
            effective_start,
            effective_end,
            holiday_dates,
            req.is_half_day,
        )

    response = []
    for lt in leave_types:
        used = used_by_type.get(lt.leave_type_id, 0)
        remaining = None
        warning_level = "NONE"
        if lt.max_days_per_year is not None:
            cap = float(lt.max_days_per_year)
            remaining = max(0.0, cap - used)
            utilization = used / cap if cap > 0 else 0
            if utilization >= 1:
                warning_level = "EXCEEDED"
            elif utilization >= 0.8:
                warning_level = "NEAR_LIMIT"

        response.append(
            LeaveUsageSummary(
                leave_type_id=lt.leave_type_id,
                leave_type_name=lt.name,
                used_days=round(used, 2),
                remaining_days=remaining,
                max_days_per_year=float(lt.max_days_per_year) if lt.max_days_per_year is not None else None,
                warning_level=warning_level,
            )
        )

    return response


@router.get("/leave-calendar", response_model=List[LeaveCalendarEntry])
async def get_leave_calendar(
    month: Optional[str] = Query(default=None, description="Format: YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """Calendar feed for leave requests (employees see own, authorized roles can see all)."""
    await _ensure_leave_schema(db)
    if month:
        try:
            parts = month.split("-")
            year = int(parts[0])
            mon = int(parts[1])
            start = date(year, mon, 1)
            end = date(year + (1 if mon == 12 else 0), 1 if mon == 12 else mon + 1, 1)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")
    else:
        today = date.today()
        start = date(today.year, today.month, 1)
        end = date(today.year + (1 if today.month == 12 else 0), 1 if today.month == 12 else today.month + 1, 1)

    stmt = (
        select(LeaveRequest)
        .options(joinedload(LeaveRequest.leave_type), joinedload(LeaveRequest.employee))
        .where(LeaveRequest.end_date >= start, LeaveRequest.start_date < end)
        .where(LeaveRequest.status.in_(["PENDING", "APPROVED"]))
        .order_by(LeaveRequest.start_date.asc())
    )

    if current_user.role.name == "EMPLOYEE":
        stmt = stmt.where(LeaveRequest.employee_id == current_user.employee_id)

    rows = (await db.execute(stmt)).scalars().all()
    return [
        LeaveCalendarEntry(
            request_id=r.leave_id,
            employee_id=r.employee_id,
            employee_name=f"{r.employee.first_name} {r.employee.last_name}",
            leave_type_name=r.leave_type.name if r.leave_type else None,
            start_date=r.start_date,
            end_date=r.end_date,
            status=r.status,
            is_half_day=r.is_half_day,
            half_day_session=r.half_day_session,
        )
        for r in rows
    ]


@router.get("/leave-holidays", response_model=List[LeaveHolidayEntry])
async def get_leave_holidays(
    month: Optional[str] = Query(default=None, description="Format: YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """List company holidays for leave calendar overlays."""
    if month:
        try:
            parts = month.split("-")
            year = int(parts[0])
            mon = int(parts[1])
            start = date(year, mon, 1)
            end = date(year + (1 if mon == 12 else 0), 1 if mon == 12 else mon + 1, 1)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")
    else:
        today = date.today()
        start = date(today.year, today.month, 1)
        end = date(today.year + (1 if today.month == 12 else 0), 1 if today.month == 12 else today.month + 1, 1)

    rows = (
        await db.execute(
            select(Holiday)
            .where(Holiday.holiday_date >= start, Holiday.holiday_date < end)
            .order_by(Holiday.holiday_date.asc())
        )
    ).scalars().all()

    return [
        LeaveHolidayEntry(
            holiday_id=h.holiday_id,
            name=h.name,
            holiday_date=h.holiday_date,
        )
        for h in rows
    ]


@router.get("/leave-requests/my/export")
async def export_my_leave_requests(
    format: str = Query("pdf", description="Export format: csv or pdf"),
    month: Optional[str] = Query(default=None, description="Format: YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """Export current user's leave request history as CSV or PDF."""
    await _ensure_leave_schema(db)
    if format not in ["csv", "pdf"]:
        raise HTTPException(status_code=400, detail="Format must be csv or pdf")

    stmt = (
        select(LeaveRequest)
        .options(joinedload(LeaveRequest.leave_type), joinedload(LeaveRequest.employee))
        .where(LeaveRequest.employee_id == current_user.employee_id)
        .order_by(LeaveRequest.created_at.desc())
    )

    if month:
        try:
            parts = month.split("-")
            year = int(parts[0])
            mon = int(parts[1])
            start = date(year, mon, 1)
            end = date(year + (1 if mon == 12 else 0), 1 if mon == 12 else mon + 1, 1)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")
        stmt = stmt.where(LeaveRequest.end_date >= start, LeaveRequest.start_date < end)

    rows_db = (await db.execute(stmt)).scalars().all()
    holiday_start = min((r.start_date for r in rows_db), default=None)
    holiday_end = max((r.end_date for r in rows_db), default=None)
    holiday_dates = set()
    if holiday_start and holiday_end:
        holiday_rows = (
            await db.execute(
                select(Holiday).where(Holiday.holiday_date >= holiday_start, Holiday.holiday_date <= holiday_end)
            )
        ).scalars().all()
        holiday_dates = {h.holiday_date for h in holiday_rows}

    headers = ["Leave Type", "Start Date", "End Date", "Effective Days", "Status", "Reason", "Review Comment", "Reviewed At"]
    rows = []
    for r in rows_db:
        effective_days = _compute_effective_leave_days(r.start_date, r.end_date, holiday_dates, r.is_half_day)
        rows.append([
            r.leave_type.name if r.leave_type else "N/A",
            r.start_date.isoformat(),
            r.end_date.isoformat(),
            str(round(effective_days, 2)),
            r.status,
            r.reason or "—",
            r.review_comment or "—",
            r.reviewed_at.isoformat() if r.reviewed_at else "—",
        ])

    month_tag = month or "all"
    filename = f"leave_history_{month_tag}"
    subtitle = f"Employee: {current_user.employee.full_name if current_user.employee else current_user.email} | Records: {len(rows)}"

    if format == "csv":
        output = generate_csv(headers, rows)
        media_type = "text/csv"
        filename += ".csv"
    else:
        output = generate_pdf("ERAOTS Leave History", headers, rows, subtitle)
        media_type = "application/pdf"
        filename += ".pdf"

    return StreamingResponse(
        output,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.put("/leave-requests/{request_id}/status", response_model=MessageResponse)
async def update_leave_status(
    request_id: uuid.UUID,
    status: str = Query(..., description="APPROVED or REJECTED"),
    comment: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """HR ONLY: Approve or Reject a leave request."""
    await _ensure_leave_schema(db)
    if "HR" not in current_user.role.name and current_user.role.name != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
        
    status = status.upper()
    if status not in ["APPROVED", "REJECTED"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    if not comment or not comment.strip():
        raise HTTPException(status_code=400, detail="Review comment is required")
        
    result = await db.execute(select(LeaveRequest).where(LeaveRequest.leave_id == request_id))
    req = result.scalar_one_or_none()
    
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")
        
    req.status = status
    req.reviewed_by = current_user.employee_id
    req.review_comment = comment
    req.reviewed_at = datetime.now(timezone.utc)
    await db.flush()
    
    # Needs to notify the user
    # Find the user's UserAccount to get the user_id (not employee_id) since Notification maps to UserAccount
    user_account_res = await db.execute(select(UserAccount).where(UserAccount.employee_id == req.employee_id))
    uacc = user_account_res.scalar_one_or_none()
    if uacc:
        from app.core.notifications import dispatch_notification
        await dispatch_notification(
            db=db,
            user_id=uacc.user_id,
            title=f"Leave Request {status.capitalize()}",
            message=f"Your leave request for {req.start_date.isoformat()} to {req.end_date.isoformat()} was {status.lower()}.\nReview comment: {comment.strip()}",
            notification_type="LEAVE_UPDATE"
        )
    
    return MessageResponse(message=f"Leave request has been {status.lower()}")


@router.put("/leave-requests/{request_id}/cancel", response_model=MessageResponse)
async def cancel_my_leave_request(
    request_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """Cancel a pending leave request owned by the current user."""
    await _ensure_leave_schema(db)
    result = await db.execute(
        select(LeaveRequest).where(
            LeaveRequest.leave_id == request_id,
            LeaveRequest.employee_id == current_user.employee_id,
        )
    )
    req = result.scalar_one_or_none()

    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending leave requests can be cancelled")

    req.status = "CANCELLED"
    req.review_comment = "Cancelled by employee"
    req.reviewed_at = datetime.now(timezone.utc)
    await db.flush()

    user_account_res = await db.execute(select(UserAccount).where(UserAccount.employee_id == req.employee_id))
    uacc = user_account_res.scalar_one_or_none()
    if uacc:
        from app.core.notifications import dispatch_notification
        await dispatch_notification(
            db=db,
            user_id=uacc.user_id,
            title="Leave Request Cancelled",
            message=f"Your pending leave request for {req.start_date.isoformat()} to {req.end_date.isoformat()} has been cancelled.",
            notification_type="LEAVE_UPDATE"
        )

    return MessageResponse(message="Leave request cancelled successfully")
