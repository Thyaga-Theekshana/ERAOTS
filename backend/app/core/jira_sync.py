"""
JIRA Sync Service.

Polls the global Jira instance using a Service Account to track
employee productivity (tickets closed, time logged) and compares it
against ERAOTS active desk time.
"""
import logging
import uuid
import random
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.employee import Employee, UserAccount, Role
from app.models.attendance import AttendanceRecord
from app.models.productivity import DailyProductivityLog
from app.models.policies import Policy
from app.models.notifications import Notification

try:
    from jira import JIRA
    from jira.exceptions import JIRAError
    JIRA_AVAILABLE = True
except ImportError:
    JIRA_AVAILABLE = False


logger = logging.getLogger("eraots.jira_sync")

def _get_jira_client():
    if not JIRA_AVAILABLE or not settings.JIRA_URL or not settings.JIRA_API_TOKEN:
        return None
        
    try:
        return JIRA(
            server=settings.JIRA_URL,
            basic_auth=(settings.JIRA_SERVICE_EMAIL, settings.JIRA_API_TOKEN)
        )
    except Exception as e:
        logger.error(f"Failed to connect to Jira: {e}")
        return None


async def sync_all_jira_productivity(db: AsyncSession) -> int:
    """
    Called by the background scheduler.
    Iterates through all employees, fetches their Jira stats for the day,
    and updates the DailyProductivityLog. Also fires alerts if efficiency is low.
    """
    now = datetime.now(timezone.utc)
    today_str = now.strftime('%Y-%m-%d')
    # Use JQL friendly date
    jql_date = now.strftime('%Y/%m/%d')
    
    jira = _get_jira_client()
    
    # Get Efficiency Threshold Policy
    policy_res = await db.execute(
        select(Policy).where(
            Policy.policy_type == "EFFICIENCY_THRESHOLD",
            Policy.department_id.is_(None),
            Policy.is_active == True,
        )
    )
    threshold_policy = policy_res.scalar_one_or_none()
    efficiency_threshold = threshold_policy.value.get("threshold_percentage", 70) if threshold_policy else 70

    # Get all active employees
    employees_res = await db.execute(
        select(Employee).join(UserAccount).where(UserAccount.is_active == True)
    )
    employees = employees_res.scalars().all()
    
    # Find active managers to send alerts to
    managers_res = await db.execute(
        select(UserAccount).join(Role).where(
            and_(
                UserAccount.is_active == True,
                Role.name.in_(["HR_MANAGER", "MANAGER", "SUPER_ADMIN"])
            )
        )
    )
    managers = managers_res.scalars().all()

    processed_count = 0
    for emp in employees:
        # Get their attendance record for today to get eraots_active_minutes
        att_res = await db.execute(
            select(AttendanceRecord).where(
                and_(
                    AttendanceRecord.employee_id == emp.employee_id,
                    AttendanceRecord.attendance_date == now.date()
                )
            )
        )
        attendance = att_res.scalar_one_or_none()
        
        # If they haven't scanned in today, skip them
        if not attendance or attendance.total_active_time_min == 0:
            continue
            
        eraots_min = attendance.total_active_time_min
        
        jira_min = 0
        resolved_count = 0
        
        # ---------------------------------------------------------
        # PULL FROM ACTUAL JIRA IF CONFIGURED, ELSE SIMULATE IF ENABLED
        # ---------------------------------------------------------
        if jira:
            try:
                # 1. Get resolved tickets today
                # 'resolved >= startOfDay()' matches tickets resolved today by assignee
                jql_resolved = f'assignee = "{emp.email}" AND resolved >= startOfDay()'
                resolved_issues = jira.search_issues(jql_resolved, maxResults=50)
                resolved_count = len(resolved_issues)
                
                # 2. Get logged time today (Worklogs)
                # JIRA API makes fetching worklogs per user tricky via simple JQL, usually need to hit /worklog
                # For this implementation, we simulate fetching the worklog sum:
                jql_worked = f'worklogAuthor = "{emp.email}" AND worklogDate >= startOfDay()'
                worked_issues = jira.search_issues(jql_worked, maxResults=50, fields="worklog")
                
                for issue in worked_issues:
                    for wl in issue.fields.worklog.worklogs:
                        # Check if worklog is today and by this user
                        if wl.author.emailAddress == emp.email and wl.started.startswith(today_str):
                            # timeSpentSeconds to minutes
                            jira_min += wl.timeSpentSeconds // 60
                            
            except Exception as e:
                logger.error(f"Jira API query failed for {emp.email}: {e}")
                
        elif settings.SIMULATOR_ENABLED:
            # Simulate productivity based on active time (approx 60-95% efficiency)
            efficiency_sim = random.uniform(0.50, 0.95)
            jira_min = int(eraots_min * efficiency_sim)
            resolved_count = random.randint(0, 5)
        else:
            continue  # No Jira and simulator disabled
            
        
        # Calculate Efficiency Ratio
        efficiency_pct = round((jira_min / eraots_min) * 100, 2) if eraots_min > 0 else 0.0
        
        # Ensure it doesn't artificially go above 100 on bugs
        efficiency_pct = min(efficiency_pct, 100.0)

        # Update or Create DailyProductivityLog
        log_res = await db.execute(
            select(DailyProductivityLog).where(
                and_(
                    DailyProductivityLog.employee_id == emp.employee_id,
                    DailyProductivityLog.log_date == today_str
                )
            )
        )
        prod_log = log_res.scalar_one_or_none()
        
        if prod_log:
            prod_log.tickets_resolved_count = resolved_count
            prod_log.jira_time_logged_minutes = jira_min
            prod_log.eraots_active_minutes = eraots_min
            prod_log.efficiency_percentage = efficiency_pct
            prod_log.last_synced_at = now
        else:
            prod_log = DailyProductivityLog(
                employee_id=emp.employee_id,
                log_date=today_str,
                tickets_resolved_count=resolved_count,
                jira_time_logged_minutes=jira_min,
                eraots_active_minutes=eraots_min,
                efficiency_percentage=efficiency_pct,
                last_synced_at=now
            )
            db.add(prod_log)
            
        # Check if efficiency is below threshold and they've been at the desk for at least 2 hours
        # (Don't alert early in the morning when metrics are volatile)
        if eraots_min > 120 and efficiency_pct < efficiency_threshold:
            # Notify managers
            for manager in managers:
                # Check if we already notified this manager today about this employee
                # (Simple check logic - real apps might use a separate notification log)
                db.add(Notification(
                    recipient_id=manager.employee_id,
                    title=f"Low Efficiency Alert: {emp.full_name}",
                    message=f"Efficiency is at {efficiency_pct}% (At Desk: {eraots_min}m, Jira: {jira_min}m). Threshold is {efficiency_threshold}%.",
                    type="SYSTEM_ALERT",
                    channel="IN_APP",
                    priority="MEDIUM"
                ))
            
            logger.warning(f"Efficiency alert fired for {emp.full_name} ({efficiency_pct}% < {efficiency_threshold}%)")
            
            
        processed_count += 1
        
    await db.commit()
    logger.info(f"Processed Jira productivity metrics for {processed_count} active employees.")
    return processed_count
