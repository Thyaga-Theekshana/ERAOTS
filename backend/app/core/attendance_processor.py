"""
Processor engine that transforms raw scan events into structured daily attendance records (FR4).
Calculates total work hours, delays, breaks, and IN_MEETING time.

Hybrid "Away vs On-Desk" Calculation:
- total_active_time_min: True "At Desk" time (ACTIVE status only)
- total_meeting_time_min: Time spent in meetings (IN_MEETING status)
- total_productive_time_min: Combined active + meeting time

Source of Truth:
- StatusLog is the primary source for all time calculations.
  Every status change (BIOMETRIC, MANUAL, CALENDAR_SYNC) is written to StatusLog
  by the events API, giving a complete minute-level audit trail.
- Fallback to raw ScanEvent pairs when no StatusLog entries exist (e.g. legacy data).
"""
from typing import Optional
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.events import ScanEvent, OccupancyState, PendingStateTransition, StatusLog
from app.models.employee import Employee
from app.models.attendance import AttendanceRecord
from app.models.policies import Policy
from app.core.config import settings
from app.core.attendance_schedule import get_employee_schedule_for_date, get_schedule_window
import uuid
import logging

logger = logging.getLogger("eraots.attendance_processor")


class StatusTransition:
    """Helper class to track status changes within a day."""
    def __init__(self, timestamp: datetime, status: str, source: str):
        self.timestamp = timestamp
        self.status = status
        self.source = source  # BIOMETRIC, MANUAL, CALENDAR_SYNC


async def get_status_transitions_for_day(
    db: AsyncSession, 
    employee_id: uuid.UUID, 
    target_date: date
) -> list[StatusTransition]:
    """
    Build a timeline of status transitions for a specific day.

    Primary source: StatusLog (covers biometric, manual, and calendar changes).
    Fallback: ScanEvent pairs (for data recorded before StatusLog was introduced).
    """
    start_of_day = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
    end_of_day = datetime.combine(target_date, datetime.max.time(), tzinfo=timezone.utc)

    # ── Primary: StatusLog ──────────────────────────────────────────────────────
    log_stmt = select(StatusLog).where(
        and_(
            StatusLog.employee_id == employee_id,
            StatusLog.changed_at >= start_of_day,
            StatusLog.changed_at <= end_of_day,
        )
    ).order_by(StatusLog.changed_at.asc())

    log_entries = (await db.execute(log_stmt)).scalars().all()

    if log_entries:
        return [
            StatusTransition(entry.changed_at, entry.to_status, entry.source)
            for entry in log_entries
        ]

    # ── Fallback: reconstruct from ScanEvent + resolved PendingStateTransition ──
    transitions = []

    scan_stmt = select(ScanEvent).where(
        and_(
            ScanEvent.employee_id == employee_id,
            ScanEvent.scan_timestamp >= start_of_day,
            ScanEvent.scan_timestamp <= end_of_day,
            ScanEvent.is_valid == True
        )
    ).order_by(ScanEvent.scan_timestamp.asc())

    scan_events = (await db.execute(scan_stmt)).scalars().all()

    for event in scan_events:
        if event.direction == "IN":
            transitions.append(StatusTransition(event.scan_timestamp, "ACTIVE", "BIOMETRIC"))
        elif event.direction == "OUT":
            transitions.append(StatusTransition(event.scan_timestamp, "OUTSIDE", "BIOMETRIC"))

    # Resolved calendar transitions (IN_MEETING periods)
    transition_stmt = select(PendingStateTransition).where(
        and_(
            PendingStateTransition.employee_id == employee_id,
            PendingStateTransition.triggered_at >= start_of_day,
            PendingStateTransition.triggered_at <= end_of_day,
            PendingStateTransition.status.in_(["CONFIRMED", "AUTO_CONFIRMED"])
        )
    ).order_by(PendingStateTransition.resolved_at.asc())

    pending_transitions = (await db.execute(transition_stmt)).scalars().all()

    for pt in pending_transitions:
        if pt.resolved_at:
            transitions.append(StatusTransition(pt.resolved_at, "IN_MEETING", "CALENDAR_SYNC"))

    transitions.sort(key=lambda t: t.timestamp)
    return transitions


async def process_daily_attendance(db: AsyncSession, target_date: date, employee_id: Optional[uuid.UUID] = None) -> list[AttendanceRecord]:
    """
    Process attendance for a specific date. 
    If employee_id is provided, process only for that employee.
    
    Updated to use StatusLog as the primary source of truth for time breakdowns:
    - total_active_time_min:      Time with ACTIVE status (truly at desk)
    - total_meeting_time_min:     Time with IN_MEETING status
    - total_productive_time_min:  active + meeting
    - total_break_duration_min:   Time with ON_BREAK or AWAY status while inside
    - total_time_in_building_min: first_entry → last_exit wall-clock span
    """
    # Start and end of the day in UTC
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
        # 2. Get all valid scan events for first_entry / last_exit timestamps
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
            continue  # Person didn't show up
        
        # 3. Get status transitions — StatusLog is the primary source (FR4)
        transitions = await get_status_transitions_for_day(db, emp.employee_id, target_date)

        # 4. Calculate time metrics from status transitions
        first_entry = events[0].scan_timestamp
        last_exit = events[-1].scan_timestamp if len(events) > 1 else None
        
        total_active_minutes = 0
        total_meeting_minutes = 0
        total_break_minutes = 0
        break_count = 0
        overtime_min = 0

        # Resolve schedule for FR4.2 / FR4.3 / FR4.8
        schedule = await get_employee_schedule_for_date(db, emp.employee_id, target_date)
        scheduled_start = None
        scheduled_end = None
        schedule_grace_minutes = settings.GRACE_PERIOD_MINUTES
        if schedule:
            scheduled_start, scheduled_end, _, schedule_grace_minutes = get_schedule_window(
                target_date, schedule
            )
        
        if len(transitions) > 1:
            for i in range(len(transitions) - 1):
                current = transitions[i]
                next_t = transitions[i + 1]
                delta_minutes = int((next_t.timestamp - current.timestamp).total_seconds() / 60)

                segment_start = current.timestamp
                segment_end = next_t.timestamp
                productive_segment = current.status in ("ACTIVE", "IN_MEETING")

                if current.status == "ACTIVE":
                    total_active_minutes += delta_minutes
                elif current.status == "IN_MEETING":
                    total_meeting_minutes += delta_minutes
                elif current.status in ("ON_BREAK", "AWAY") and delta_minutes > 0:
                    total_break_minutes += delta_minutes
                    break_count += 1

                if productive_segment and scheduled_end:
                    overlap_start = max(segment_start, scheduled_end)
                    overlap_end = segment_end
                    if overlap_end > overlap_start:
                        overtime_min += int((overlap_end - overlap_start).total_seconds() / 60)

            # Handle the final segment (employee still inside at time of processing)
            last_transition = transitions[-1]
            if last_transition.status != "OUTSIDE":
                now = datetime.now(timezone.utc)
                if now < end_of_day:
                    trailing = int((now - last_transition.timestamp).total_seconds() / 60)
                    segment_start = last_transition.timestamp
                    segment_end = now
                    if last_transition.status == "IN_MEETING":
                        total_meeting_minutes += trailing
                    elif last_transition.status in ("ON_BREAK", "AWAY"):
                        total_break_minutes += trailing
                    elif last_transition.status == "ACTIVE":
                        total_active_minutes += trailing

                    if last_transition.status in ("ACTIVE", "IN_MEETING") and scheduled_end:
                        overlap_start = max(segment_start, scheduled_end)
                        overlap_end = segment_end
                        if overlap_end > overlap_start:
                            overtime_min += int((overlap_end - overlap_start).total_seconds() / 60)

        elif len(transitions) == 1:
            # Only one transition (entry, never left) — count time until now or end-of-day
            single = transitions[0]
            if single.status != "OUTSIDE":
                now = datetime.now(timezone.utc)
                cap = min(now, end_of_day)
                delta_minutes = int((cap - single.timestamp).total_seconds() / 60)
                if single.status == "ACTIVE":
                    total_active_minutes += delta_minutes
                elif single.status == "IN_MEETING":
                    total_meeting_minutes += delta_minutes
                if single.status in ("ACTIVE", "IN_MEETING") and scheduled_end and cap > scheduled_end:
                    overlap_start = max(single.timestamp, scheduled_end)
                    overlap_end = cap
                    if overlap_end > overlap_start:
                        overtime_min += int((overlap_end - overlap_start).total_seconds() / 60)

        else:
            # No status log entries and no fallback transitions: use raw IN/OUT
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

        total_time_in_building = 0
        if last_exit:
            total_time_in_building = int((last_exit - first_entry).total_seconds() / 60)

        # Calculate total productive time (At Desk + In Meeting)
        total_productive_minutes = total_active_minutes + total_meeting_minutes

        # Late flag is based on assigned schedule + grace when available (FR4.2),
        # otherwise fallback to START_TIME policy.
        if scheduled_start:
            expected_arrival = scheduled_start + timedelta(minutes=schedule_grace_minutes)
        else:
            start_time_policy = (
                await db.execute(
                    select(Policy).where(
                        and_(Policy.policy_type == "START_TIME", Policy.is_active == True)
                    )
                )
            ).scalars().first()
            office_start_hour = int(start_time_policy.value.get("hour", 9)) if start_time_policy else 9
            office_start_min = int(start_time_policy.value.get("minute", 0)) if start_time_policy else 0
            expected_arrival = datetime.combine(
                target_date,
                datetime.min.time().replace(hour=office_start_hour, minute=office_start_min),
                tzinfo=timezone.utc,
            ) + timedelta(minutes=settings.GRACE_PERIOD_MINUTES)
        
        is_late = False
        late_duration_min = 0
        cmp_first_entry = first_entry.replace(tzinfo=timezone.utc) if first_entry.tzinfo is None else first_entry
        
        if cmp_first_entry > expected_arrival:
            is_late = True
            late_duration_min = int((cmp_first_entry - expected_arrival).total_seconds() / 60)
            
        # Overtime is productive time beyond scheduled shift end (FR4.3).
        # Fallback to threshold policy only when no schedule is assigned.
        if not scheduled_end:
            ot_policy = (
                await db.execute(
                    select(Policy).where(
                        and_(Policy.policy_type == "OVERTIME_THRESHOLD", Policy.is_active == True)
                    )
                )
            ).scalars().first()
            threshold_min = int(ot_policy.value.get("threshold_min", 480)) if ot_policy else 480
            overtime_min = max(0, total_productive_minutes - threshold_min)

        # 5. Upsert Attendance Record
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
        record.total_meeting_time_min = total_meeting_minutes
        record.total_productive_time_min = total_productive_minutes
        record.break_count = break_count
        record.total_break_duration_min = total_break_minutes
        record.is_late = is_late
        record.late_duration_min = late_duration_min
        record.overtime_duration_min = overtime_min
        record.status = "PRESENT"
        
        await db.flush()
        processed_records.append(record)
        
    await db.commit()
    logger.info(f"Processed attendance for {len(processed_records)} employees on {target_date}")
    return processed_records
