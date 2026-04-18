from datetime import date
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.schedule import LeaveRequest, Holiday
from app.core.database import AsyncSessionLocal
import logging

logger = logging.getLogger("eraots.notification_suppressor")

async def should_suppress(employee_id: str, current_date: date) -> tuple[bool, str | None]:
    """
    Check if notifications should be suppressed for a specific employee on a specific date.
    Returns (True, reason) if suppressed, otherwise (False, None).
    """
    try:
        async with AsyncSessionLocal() as db:
            # Check for approved leaves
            leave_result = await db.execute(
                select(LeaveRequest).where(
                    and_(
                        LeaveRequest.employee_id == employee_id,
                        LeaveRequest.status == "APPROVED",
                        LeaveRequest.start_date <= current_date,
                        LeaveRequest.end_date >= current_date
                    )
                )
            )
            if leave_result.scalar_one_or_none():
                return True, "ON_LEAVE"

            # Check for holidays
            holiday_result = await db.execute(
                select(Holiday).where(Holiday.date == current_date)
            )
            if holiday_result.scalar_one_or_none():
                return True, "HOLIDAY"

            return False, None
    except Exception as e:
        logger.error(f"Error in should_suppress for employee {employee_id}: {e}")
        return False, None
