"""
Processor engine that transforms raw scan events into structured daily attendance records (FR4).
Calculates total work hours, delays, and breaks.
"""
from typing import Optional
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.events import ScanEvent
from app.models.employee import Employee
from app.models.attendance import AttendanceRecord
import uuid
import logging

logger = logging.getLogger("eraots.attendance_processor")

async def process_daily_attendance(db: AsyncSession, target_date: date, employee_id: Optional[uuid.UUID] = None) -> list[AttendanceRecord]:
    """
    Process attendance for a specific date. 
    If employee_id is provided, process only for that employee.
    """
    # Start and end of the day in UTC (Assuming office timezone aligns with UTC for simplicity in phase B)
    start_of_day = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
    end_of_day = datetime.combine(target_date, datetime.max.time(), tzinfo=timezone.utc)

    # 1. Get employees to process
    if employee_id:
        emp_query = select(Employee).where(Employee.employee_id == employee_id)
    else:
        emp_query = select(Employee).where(Employee.status == "ACTIVE")
    
    employees = (await db.execute(emp_query)).scalars().all()
    processed_records = []

    for emp in employees:
        # 2. Get all valid scan events for this employee on this day, ordered chronologically
        stmt = select(ScanEvent).where(
            and_(
                ScanEvent.employee_id == emp.employee_id,
                ScanEvent.scan_timestamp >= start_of_day,
                ScanEvent.scan_timestamp <= end_of_day,
                ScanEvent.is_valid == True
            )
        ).order_by(ScanEvent.scan_timestamp.asc())
        
        events = (await db.execute(stmt)).scalars().all()
        
        if not events:
            continue  # Person didn't show up. (Leave and absent handling happens separately)

        # 3. Calculate metrics
        first_entry = events[0].scan_timestamp
        last_exit = events[-1].scan_timestamp if len(events) > 1 else None
        
        total_active_minutes = 0
        current_state = "OUT"
        last_time = None
        
        for event in events:
            if event.direction == "IN":
                current_state = "IN"
                last_time = event.scan_timestamp
            elif event.direction == "OUT":
                if current_state == "IN" and last_time:
                    delta = event.scan_timestamp - last_time
                    total_active_minutes += int(delta.total_seconds() / 60)
                current_state = "OUT"
                last_time = event.scan_timestamp

        # If they haven't checked out yet and we are running mid-day
        if current_state == "IN" and last_time:
            now = datetime.now(timezone.utc)
            if now < end_of_day:
                delta = now - last_time
                total_active_minutes += int(delta.total_seconds() / 60)
                
        total_time_in_building = 0
        if last_exit:
            total_time_in_building = int((last_exit - first_entry).total_seconds() / 60)

        office_start_hour = 9 # Configurable later via Policies (FR15)
        expected_arrival = datetime.combine(target_date, datetime.min.time().replace(hour=office_start_hour), tzinfo=timezone.utc)
        
        is_late = False
        late_duration_min = 0
        cmp_first_entry = first_entry.replace(tzinfo=timezone.utc) if first_entry.tzinfo is None else first_entry
        
        if cmp_first_entry > expected_arrival:
            is_late = True
            late_duration_min = int((cmp_first_entry - expected_arrival).total_seconds() / 60)
            
        overtime_min = max(0, total_active_minutes - (8 * 60)) # Assumes 8 hr workday constraint

        # 4. Upsert Attendance Record
        record_stmt = select(AttendanceRecord).where(
            and_(
                AttendanceRecord.employee_id == emp.employee_id,
                AttendanceRecord.attendance_date == target_date
            )
        )
        record = (await db.execute(record_stmt)).scalars().first()
        
        if not record:
            record = AttendanceRecord(
                employee_id=emp.employee_id,
                attendance_date=target_date,
            )
            db.add(record)
            
        record.first_entry = first_entry
        record.last_exit = last_exit
        record.total_time_in_building_min = total_time_in_building
        record.total_active_time_min = total_active_minutes
        record.is_late = is_late
        record.late_duration_min = late_duration_min
        record.overtime_duration_min = overtime_min
        record.status = "PRESENT"
        
        await db.flush()
        processed_records.append(record)
        
    await db.commit()
    logger.info(f"Processed attendance for {len(processed_records)} employees on {target_date}")
    return processed_records
