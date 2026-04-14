"""
Background Scheduler — FR2.3, FR2.5, FR2.6.

Runs periodic tasks as an asyncio background loop during app lifetime:
1. promote_breaks_to_away()     — ON_BREAK → AWAY after BREAK_THRESHOLD_MINUTES (FR2.3)
2. process_end_of_day_checkout() — Auto-checkout at configurable time (FR2.6)
3. process_expired_transitions() — Auto-confirm 30-sec meeting transitions (FR2.5)
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.events import OccupancyState, StatusLog, PendingStateTransition
from app.models.notifications import Notification
from app.core.calendar_sync import poll_all_calendars
from app.core.jira_sync import sync_all_jira_productivity

from app.core.hardware_monitor import HardwareMonitorService

logger = logging.getLogger("eraots.scheduler")

SCHEDULER_INTERVAL_SECONDS = 60  # Run every 60 seconds


async def _log_status_change(
    db: AsyncSession,
    employee_id: uuid.UUID,
    from_status: str,
    to_status: str,
    source: str,
    changed_at: datetime,
    scan_event_id: uuid.UUID = None,
):
    """Persist a status transition to the immutable StatusLog."""
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


async def promote_breaks_to_away(db: AsyncSession) -> int:
    """
    FR2.3: Transition ON_BREAK → AWAY after BREAK_THRESHOLD_MINUTES.

    Employees who scanned out and entered ON_BREAK status more than
    BREAK_THRESHOLD_MINUTES ago (default 30 min) are promoted to AWAY,
    indicating they have exceeded the expected break duration.
    """
    threshold = settings.BREAK_THRESHOLD_MINUTES
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=threshold)

    result = await db.execute(
        select(OccupancyState).where(
            and_(
                OccupancyState.current_status == "ON_BREAK",
                OccupancyState.last_state_change <= cutoff,
            )
        )
    )
    on_break_states = result.scalars().all()

    promoted = 0
    now = datetime.now(timezone.utc)

    for state in on_break_states:
        previous_status = state.current_status
        state.current_status = "AWAY"
        state.last_state_change = now
        state.last_change_source = "SYSTEM"

        await _log_status_change(
            db=db,
            employee_id=state.employee_id,
            from_status=previous_status,
            to_status="AWAY",
            source="SYSTEM",
            changed_at=now,
        )

        promoted += 1

    if promoted > 0:
        await db.commit()
        logger.info(f"Promoted {promoted} employee(s) from ON_BREAK → AWAY (>{threshold}min)")

    return promoted


async def process_end_of_day_checkout(db: AsyncSession) -> int:
    """
    FR2.6: Auto-checkout all employees still inside at end-of-day time.

    At AUTO_CHECKOUT_HOUR:AUTO_CHECKOUT_MINUTE (default 23:59), all employees
    with a non-OUTSIDE status are forced to OUTSIDE and a synthetic
    AUTO_CHECKOUT scan event is created.

    This only fires once — during the minute window matching the configured time.
    """
    now = datetime.now(timezone.utc)

    # Check if current UTC time matches the auto-checkout window
    # We allow a 60-second window so the 60s scheduler doesn't miss it
    checkout_today = now.replace(
        hour=settings.AUTO_CHECKOUT_HOUR,
        minute=settings.AUTO_CHECKOUT_MINUTE,
        second=0,
        microsecond=0,
    )
    # Only fire during the target minute
    if not (checkout_today <= now < checkout_today + timedelta(seconds=SCHEDULER_INTERVAL_SECONDS)):
        return 0

    result = await db.execute(
        select(OccupancyState).where(
            OccupancyState.current_status.in_(["ACTIVE", "IN_MEETING", "ON_BREAK", "AWAY"])
        )
    )
    active_states = result.scalars().all()

    checked_out = 0
    for state in active_states:
        previous_status = state.current_status

        # Note: We don't create a ScanEvent because scanner_id is NOT NULL
        # and there is no physical scanner for system-generated events.
        # The StatusLog is the source of truth for this transition.

        state.current_status = "OUTSIDE"
        state.last_state_change = now
        state.last_change_source = "SYSTEM"

        await _log_status_change(
            db=db,
            employee_id=state.employee_id,
            from_status=previous_status,
            to_status="OUTSIDE",
            source="SYSTEM",
            changed_at=now,
        )

        checked_out += 1

    if checked_out > 0:
        await db.commit()
        logger.info(f"End-of-day auto-checkout: {checked_out} employee(s) set to OUTSIDE")

    return checked_out


async def process_expired_transitions(db: AsyncSession) -> int:
    """
    FR2.5 / 30-Second Rule: Auto-confirm expired pending transitions.

    When a calendar meeting triggers a PendingStateTransition and the employee
    neither confirms nor cancels within TRANSITION_TIMEOUT_SECONDS (30s),
    the transition is auto-confirmed and the employee moves to IN_MEETING.
    """
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(PendingStateTransition).where(
            and_(
                PendingStateTransition.status == "PENDING",
                PendingStateTransition.expires_at <= now,
            )
        )
    )
    expired = result.scalars().all()

    auto_confirmed = 0
    for transition in expired:
        # Get employee's current occupancy state
        state_result = await db.execute(
            select(OccupancyState).where(
                OccupancyState.employee_id == transition.employee_id
            )
        )
        occupancy_state = state_result.scalar_one_or_none()

        # Only auto-confirm if employee is still inside (not scanned out / on break)
        if occupancy_state and occupancy_state.current_status in ("ACTIVE", "ON_BREAK"):
            previous_status = occupancy_state.current_status
            transition.status = "AUTO_CONFIRMED"
            transition.resolution_source = "TIMEOUT"
            transition.resolved_at = now

            occupancy_state.current_status = "IN_MEETING"
            occupancy_state.last_state_change = now
            occupancy_state.last_change_source = "CALENDAR_SYNC"

            await _log_status_change(
                db=db,
                employee_id=transition.employee_id,
                from_status=previous_status,
                to_status="IN_MEETING",
                source="AUTO_CONFIRM",
                changed_at=now,
            )

            auto_confirmed += 1
            logger.info(f"Auto-confirmed meeting transition for employee {transition.employee_id}")
        else:
            # Employee left the building or is already away — abort
            transition.status = "ABORTED"
            transition.resolution_source = "EMPLOYEE_LEFT"
            transition.resolved_at = now

        # Update the notification if one was linked
        if transition.notification_id:
            notif_result = await db.execute(
                select(Notification).where(
                    Notification.notification_id == transition.notification_id
                )
            )
            notification = notif_result.scalar_one_or_none()
            if notification:
                notification.action_taken = (
                    "TIMEOUT" if transition.status == "AUTO_CONFIRMED" else "ABORTED"
                )
                notification.action_taken_at = now

    if expired:
        await db.commit()

    if auto_confirmed > 0:
        logger.info(f"Auto-confirmed {auto_confirmed} expired meeting transition(s)")

    return auto_confirmed


async def run_scheduler():
    """
    Main scheduler loop — runs all periodic tasks every SCHEDULER_INTERVAL_SECONDS.
    Started as an asyncio background task during app lifespan.
    """
    logger.info(
        f"Scheduler started (interval={SCHEDULER_INTERVAL_SECONDS}s, "
        f"break_threshold={settings.BREAK_THRESHOLD_MINUTES}min, "
        f"auto_checkout={settings.AUTO_CHECKOUT_HOUR:02d}:{settings.AUTO_CHECKOUT_MINUTE:02d})"
    )

    while True:
        try:
            async with AsyncSessionLocal() as db:
                # Job 1: Promote ON_BREAK → AWAY
                await promote_breaks_to_away(db)

                # Job 2: End-of-day auto-checkout
                await process_end_of_day_checkout(db)

                # Job 3: Auto-confirm expired meeting transitions
                await process_expired_transitions(db)
                
                # Job 4: Poll Google Calendars for upcoming meetings
                # To avoid hitting API rate limits, we poll every 2 minutes (every other scheduler loop)
                if int(datetime.now(timezone.utc).timestamp()) % 120 < 60:
                    await poll_all_calendars(db)
                    
                # Job 5: Jira Productivity tracking
                # Run every 10 minutes
                if int(datetime.now(timezone.utc).timestamp()) % 600 < 60:
                    await sync_all_jira_productivity(db)

                # Job 6: Monitor hardware health (every 2 minutes)
                if int(datetime.now(timezone.utc).timestamp()) % 120 < 60:
                    try:
                        summary = await HardwareMonitorService.monitor_all_scanners(db)
                        if summary["status_changes"]:
                            logger.info(f"Hardware status changes: {len(summary['status_changes'])} scanner(s)")
                    except Exception as e:
                        logger.error(f"Hardware monitor error: {e}", exc_info=True)

        except asyncio.CancelledError:
            logger.info("Scheduler shutting down...")
            break
        except Exception as e:
            logger.error(f"Scheduler error: {e}", exc_info=True)

        await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS)
