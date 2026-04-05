from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from datetime import date
from typing import List, Optional
import uuid

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.employee import UserAccount
from app.models.attendance import AttendanceRecord
from app.core.attendance_processor import process_daily_attendance

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])

@router.post("/process")
async def trigger_attendance_processing(
    target_date: str = Query(..., description="Date to process in YYYY-MM-DD format"),
    employee_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """
    On-demand attendance processing calculation.
    """
    if "HR" not in current_user.role.name and current_user.role.name != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
        
    try:
        t_date = date.fromisoformat(target_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
    records = await process_daily_attendance(db, t_date, employee_id)
    return {"message": "Processing complete", "processed_records": len(records)}


@router.get("/")
async def get_attendance_records(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    employee_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """
    Retrieve attendance records, optionally filtered by date range and employee.
    """
    stmt = select(AttendanceRecord).options(joinedload(AttendanceRecord.employee))
    
    if start_date:
        stmt = stmt.where(AttendanceRecord.attendance_date >= date.fromisoformat(start_date))
    if end_date:
        stmt = stmt.where(AttendanceRecord.attendance_date <= date.fromisoformat(end_date))
        
    if employee_id:
        # Check if the user is asking for their own data, or if they are HR/Admin
        if current_user.employee_id != employee_id and current_user.role.name == "EMPLOYEE":
            raise HTTPException(status_code=403, detail="Cannot view other employees' records")
        stmt = stmt.where(AttendanceRecord.employee_id == employee_id)
    else:
        if current_user.role.name == "EMPLOYEE":
            # Employees can only see their own records if no employee_id is specified
            stmt = stmt.where(AttendanceRecord.employee_id == current_user.employee_id)
            
    stmt = stmt.order_by(AttendanceRecord.attendance_date.desc(), AttendanceRecord.employee_id)
    
    results = (await db.execute(stmt)).scalars().all()
    
    # Map to dicts for simpler JSON serialization (avoiding pydantic models here for speed)
    return [
        {
            "record_id": str(r.record_id),
            "employee_name": f"{r.employee.first_name} {r.employee.last_name}",
            "employee_id": str(r.employee_id),
            "date": r.attendance_date.isoformat(),
            "first_entry": r.first_entry.isoformat() if r.first_entry else None,
            "last_exit": r.last_exit.isoformat() if r.last_exit else None,
            "total_active_time_min": r.total_active_time_min,
            "is_late": r.is_late,
            "late_duration_min": r.late_duration_min,
            "status": r.status,
            "overtime_duration_min": r.overtime_duration_min
        }
        for r in results
    ]
