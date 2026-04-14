from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import datetime, timezone
import uuid

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.employee import UserAccount
from app.models.productivity import DailyProductivityLog

router = APIRouter(prefix="/api/productivity", tags=["Productivity Sync"])

@router.get("/my-stats")
async def get_my_productivity_stats(
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """Fetch the logged-in user's productivity stats for today."""
    today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    result = await db.execute(
        select(DailyProductivityLog).where(
            and_(
                DailyProductivityLog.employee_id == current_user.employee_id,
                DailyProductivityLog.log_date == today_str
            )
        )
    )
    prod_log = result.scalar_one_or_none()
    
    if not prod_log:
        return {
            "date": today_str,
            "tickets_resolved_count": 0,
            "jira_time_logged_minutes": 0,
            "eraots_active_minutes": 0,
            "efficiency_percentage": 0.0,
            "last_synced_at": None,
            "status": "No data yet for today"
        }
        
    return {
        "date": prod_log.log_date,
        "tickets_resolved_count": prod_log.tickets_resolved_count,
        "jira_time_logged_minutes": prod_log.jira_time_logged_minutes,
        "eraots_active_minutes": prod_log.eraots_active_minutes,
        "efficiency_percentage": prod_log.efficiency_percentage,
        "last_synced_at": prod_log.last_synced_at.isoformat() if prod_log.last_synced_at else None,
        "status": "Synced"
    }


@router.get("/team-stats")
async def get_team_productivity_stats(
    date: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """
    Managers can get the aggregated average efficiency of the system today.
    """
    if current_user.role.name not in ["HR_MANAGER", "MANAGER", "SUPER_ADMIN"]:
        raise HTTPException(status_code=403, detail="Not authorized to pull team stats")
        
    target_date = date if date else datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    result = await db.execute(
        select(
            func.avg(DailyProductivityLog.efficiency_percentage).label("avg_efficiency"),
            func.sum(DailyProductivityLog.tickets_resolved_count).label("total_tickets"),
            func.count(DailyProductivityLog.log_id).label("tracked_employees")
        ).where(DailyProductivityLog.log_date == target_date)
    )
    stats = result.first()
    
    return {
        "date": target_date,
        "avg_efficiency_percentage": round(stats.avg_efficiency or 0, 2),
        "total_tickets_resolved": stats.total_tickets or 0,
        "tracked_employees": stats.tracked_employees or 0
    }
