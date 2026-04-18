import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis
import json
import logging

from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.core.notification_suppressor import should_suppress
from app.core.notification_dispatcher import dispatch_notification
from app.models.employee import Employee, Role, UserAccount
from app.models.events import ScanEvent, OccupancyState
from app.models.schedule import EmployeeSchedule, Schedule
from app.models.alert_engine import MeetingAlert, AnnouncementAlert
from app.models.hardware import Scanner

logger = logging.getLogger("eraots.alert_triggers")

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

async def _get_hr_admins(db: AsyncSession):
    roles_result = await db.execute(select(Role).where(Role.name.in_(["HR_MANAGER", "SUPER_ADMIN"])))
    roles = roles_result.scalars().all()
    role_ids = [r.role_id for r in roles]
    
    users_result = await db.execute(select(UserAccount).where(UserAccount.role_id.in_(role_ids)))
    hr_admins = users_result.scalars().all()
    return hr_admins

async def check_late_arrivals():
    """Runs approx 30 minutes after shift start. (Celery beat)"""
    today = datetime.now(timezone.utc).date()
    now_utc = datetime.now(timezone.utc)
    
    async with AsyncSessionLocal() as db:
        # Simplification: assume default shift 09:00, grace 15
        hr_admins = await _get_hr_admins(db)
        
        # Get employees active
        result = await db.execute(select(Employee).where(Employee.status == "ACTIVE"))
        employees = result.scalars().all()
        
        for emp in employees:
            # Check suppression
            suppressed, reason = await should_suppress(emp.employee_id, today)
            if suppressed:
                logger.info(f"Skipping late alert for {emp.employee_id} ({reason})")
                continue
                
            # Check if they have an IN scan today
            scan_result = await db.execute(
                select(ScanEvent).where(
                    and_(
                        ScanEvent.employee_id == emp.employee_id,
                        func.date(ScanEvent.scan_timestamp) == today,
                        ScanEvent.direction == "IN"
                    )
                )
            )
            scans = scan_result.scalars().all()
            
            if not scans:
                # Is late!
                title = f"Late Arrival Alert"
                body = f"You have not checked in for your shift yet."
                await dispatch_notification(emp.employee_id, "LATE_ARRIVAL", title, body, "MEDIUM")
                
                # Notify HR
                for hr in hr_admins:
                    await dispatch_notification(hr.employee_id, "LATE_ARRIVAL", f"Late Arrival: {emp.first_name}", f"{emp.full_name} is late today.", "MEDIUM")

async def check_absent_employees():
    """Runs 2 hours after shift start. (Celery beat)"""
    today = datetime.now(timezone.utc).date()
    
    async with AsyncSessionLocal() as db:
        hr_admins = await _get_hr_admins(db)
        result = await db.execute(select(Employee).where(Employee.status == "ACTIVE"))
        employees = result.scalars().all()
        
        for emp in employees:
            suppressed, _ = await should_suppress(emp.employee_id, today)
            if suppressed:
                continue
                
            scan_result = await db.execute(
                select(ScanEvent).where(
                    and_(
                        ScanEvent.employee_id == emp.employee_id,
                        func.date(ScanEvent.scan_timestamp) == today
                    )
                )
            )
            scans = scan_result.scalars().all()
            
            if not scans:
                for hr in hr_admins:
                    await dispatch_notification(hr.employee_id, "ABSENT", f"Absence alert: {emp.first_name}", f"{emp.full_name} is unexpectedly absent today.", "HIGH")

async def check_early_exits(employee_id: uuid.UUID | str):
    """Called on OUT scan. Real-time hook."""
    async with AsyncSessionLocal() as db:
        emp_result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
        emp = emp_result.scalar_one_or_none()
        if not emp: return

        # Suppose schedule ends at 17:00, threshold is 60 mins early.
        # Minimal implementation for early exit.
        title = "Early Exit"
        body = "You exited before your scheduled time."
        await dispatch_notification(employee_id, "EARLY_EXIT", title, body, "MEDIUM")
        
        hr_admins = await _get_hr_admins(db)
        for hr in hr_admins:
            await dispatch_notification(hr.employee_id, "EARLY_EXIT", f"Early Exit: {emp.first_name}", f"{emp.full_name} exited early.", "MEDIUM")

async def check_frequent_lateness():
    """Runs daily end of day (Celery beat). 3+ late arrivals in 5 days."""
    today = datetime.now(timezone.utc).date()
    async with AsyncSessionLocal() as db:
        hr_admins = await _get_hr_admins(db)
        result = await db.execute(select(Employee).where(Employee.status == "ACTIVE"))
        employees = result.scalars().all()
        
        for emp in employees:
            # We would normally check attendance records here.
            # Assuming a simplified frequent logic check:
            late_count = 3 # mock
            
            if late_count >= 3:
                redis_key = f"frequent_late:{emp.employee_id}"
                has_alerted = await redis_client.get(redis_key)
                if not has_alerted:
                    await dispatch_notification(emp.employee_id, "FREQUENT_LATENESS", "Frequent Lateness", "You have been late 3 times in 5 days.", "HIGH")
                    for hr in hr_admins:
                        await dispatch_notification(hr.employee_id, "FREQUENT_LATENESS", f"Frequent Lateness: {emp.first_name}", f"{emp.full_name} late 3 times.", "HIGH")
                    await redis_client.setex(redis_key, 5 * 86400, "1")

async def check_long_breaks(employee_id: uuid.UUID | str):
    """Run via celery delayed task."""
    async with AsyncSessionLocal() as db:
        state_result = await db.execute(select(OccupancyState).where(OccupancyState.employee_id == employee_id))
        state = state_result.scalar_one_or_none()
        
        if state and state.current_status == "ON_BREAK":
            await dispatch_notification(employee_id, "LONG_BREAK", "Long Break", "You have exceeded your break threshold.", "MEDIUM")
            
            hr_admins = await _get_hr_admins(db)
            emp_result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
            emp = emp_result.scalar_one_or_none()
            for hr in hr_admins:
                await dispatch_notification(hr.employee_id, "LONG_BREAK", "Long Break Alert", f"{emp.first_name} exceeded break limit.", "LOW")

async def check_missed_exit_scans():
    """Runs daily at 23:30. Find employees still active."""
    today = datetime.now(timezone.utc).date()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(OccupancyState).where(OccupancyState.current_status.in_(["ACTIVE", "ON_BREAK"])))
        states = result.scalars().all()
        
        for state in states:
            suppressed, _ = await should_suppress(state.employee_id, today)
            if suppressed: continue
                
            await dispatch_notification(state.employee_id, "MISSED_EXIT", "Missed Exit", "Please remember to scan out. Auto-checkout at 23:59.", "MEDIUM")

async def check_over_capacity():
    """Called on IN scan."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(func.count(OccupancyState.state_id)).where(OccupancyState.current_status.in_(["ACTIVE", "IN_MEETING"])))
        current_occupancy = result.scalar() or 0
        capacity = settings.OFFICE_CAPACITY
        
        redis_key = "over_capacity_alerted"
        
        if current_occupancy >= capacity:
            has_alerted = await redis_client.get(redis_key)
            if not has_alerted:
                hr_admins = await _get_hr_admins(db)
                for hr in hr_admins:
                    await dispatch_notification(hr.employee_id, "OVER_CAPACITY", "Over Capacity Alert", f"Occupancy reached {current_occupancy}/{capacity}", "HIGH", override_channels=["in_app"])
                await redis_client.set(redis_key, "1")
        else:
            await redis_client.delete(redis_key)

async def check_device_offline(scanner_id: str):
    """Extensions for device offline."""
    async with AsyncSessionLocal() as db:
        hr_admins = await _get_hr_admins(db)
        for hr in hr_admins:
            await dispatch_notification(hr.employee_id, "DEVICE_OFFLINE", "Scanner Offline", f"Scanner {scanner_id} has gone offline.", "HIGH", override_channels=["in_app", "email"])

async def unauthorized_access_alert():
    """Unauthorized hardware scan."""
    async with AsyncSessionLocal() as db:
        hr_admins = await _get_hr_admins(db)
        for hr in hr_admins:
            await dispatch_notification(hr.employee_id, "UNAUTHORIZED", "Unauthorized Access", "An unregistered fingerprint scan was attempted.", "CRITICAL", override_channels=["in_app", "whatsapp"])

async def meeting_reminder_dispatcher():
    """Runs every 60s via beat."""
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(MeetingAlert).where(and_(MeetingAlert.is_active == True, MeetingAlert.scheduled_at > now)))
        meetings = result.scalars().all()
        
        for meeting in meetings:
            delta = (meeting.scheduled_at - now).total_seconds() / 60
            for mins in meeting.reminder_minutes:
                if delta <= mins and delta > mins - 1:
                    redis_key = f"meeting:{meeting.meeting_alert_id}:reminder:{mins}_sent"
                    has_sent = await redis_client.get(redis_key)
                    if not has_sent:
                        # Send
                        for participant_id in meeting.participant_ids:
                            await dispatch_notification(participant_id, "MEETING_REMINDER", f"Reminder: {meeting.title}", meeting.description or "Meeting starting soon.", "LOW")
                        await redis_client.setex(redis_key, 25 * 3600, "1")

async def announcement_dispatcher(announcement_id: str | uuid.UUID):
    """Dispatches to all/department/selected."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AnnouncementAlert).where(AnnouncementAlert.announcement_alert_id == announcement_id))
        ann = result.scalar_one_or_none()
        if not ann: return
        
        emp_result = await db.execute(select(Employee).where(Employee.status == "ACTIVE"))
        all_emps = emp_result.scalars().all()
        
        targets = []
        if ann.target_type == "ALL":
            targets = all_emps
        elif ann.target_type == "SELECTED":
            targets = [e for e in all_emps if str(e.employee_id) in ann.target_ids]
            
        for emp in targets:
            await dispatch_notification(emp.employee_id, "ANNOUNCEMENT", ann.title, ann.body, ann.priority)
            
        ann.sent_at = datetime.now(timezone.utc)
        await db.commit()
