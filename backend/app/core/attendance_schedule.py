from datetime import date, datetime, timezone, timedelta
from typing import Optional
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.schedule import EmployeeSchedule, Schedule


def _in_effect(assignment: EmployeeSchedule, target_date: date) -> bool:
    if assignment.effective_from and assignment.effective_from > target_date:
        return False
    if assignment.effective_to and assignment.effective_to < target_date:
        return False
    return True


async def get_employee_schedule_for_date(
    db: AsyncSession,
    employee_id: uuid.UUID,
    target_date: date,
) -> Optional[Schedule]:
    """
    Resolve the effective schedule for a given employee/date.
    Preference order:
    1. Day-specific assignment (day_of_week matches target day)
    2. Generic assignment (day_of_week is NULL)
    """
    dow = target_date.weekday()

    stmt = (
        select(EmployeeSchedule)
        .options(joinedload(EmployeeSchedule.schedule))
        .where(EmployeeSchedule.employee_id == employee_id)
        .where(or_(EmployeeSchedule.day_of_week == dow, EmployeeSchedule.day_of_week.is_(None)))
        .where(EmployeeSchedule.effective_from <= target_date)
        .where(
            or_(
                EmployeeSchedule.effective_to.is_(None),
                EmployeeSchedule.effective_to >= target_date,
            )
        )
    )

    rows = (await db.execute(stmt)).scalars().all()
    valid = [
        row for row in rows
        if row.schedule and row.schedule.is_active and _in_effect(row, target_date)
    ]
    if not valid:
        return None

    specific = [row for row in valid if row.day_of_week == dow]
    generic = [row for row in valid if row.day_of_week is None]
    chosen_pool = specific or generic
    chosen_pool.sort(
        key=lambda row: (
            row.effective_from or date.min,
            row.created_at or datetime.min.replace(tzinfo=timezone.utc),
        ),
        reverse=True,
    )
    return chosen_pool[0].schedule


def get_schedule_window(
    target_date: date,
    schedule: Schedule,
) -> tuple[datetime, datetime, int, int]:
    """
    Build scheduled shift window for a date.
    Returns: (scheduled_start_utc, scheduled_end_utc, expected_minutes, grace_minutes)
    """
    scheduled_start = datetime.combine(target_date, schedule.start_time, tzinfo=timezone.utc)
    scheduled_end = datetime.combine(target_date, schedule.end_time, tzinfo=timezone.utc)
    if scheduled_end <= scheduled_start:
        scheduled_end += timedelta(days=1)

    expected_minutes = int((scheduled_end - scheduled_start).total_seconds() // 60)
    grace_minutes = max(0, int(schedule.grace_period_min or 0))
    return scheduled_start, scheduled_end, expected_minutes, grace_minutes


def compute_schedule_comparison(
    target_date: date,
    schedule: Optional[Schedule],
    actual_minutes: int,
) -> dict:
    """
    Build FR4.8 comparison payload for actual attendance vs scheduled hours.
    """
    if not schedule:
        return {
            "scheduled_start": None,
            "scheduled_end": None,
            "scheduled_hours": None,
            "scheduled_minutes": None,
            "actual_vs_scheduled_variance_min": None,
        }

    scheduled_start, scheduled_end, expected_minutes, _ = get_schedule_window(target_date, schedule)
    return {
        "scheduled_start": scheduled_start.isoformat(),
        "scheduled_end": scheduled_end.isoformat(),
        "scheduled_hours": round(expected_minutes / 60.0, 2),
        "scheduled_minutes": expected_minutes,
        "actual_vs_scheduled_variance_min": int(actual_minutes or 0) - expected_minutes,
    }
