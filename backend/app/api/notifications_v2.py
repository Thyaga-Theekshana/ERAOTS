from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, desc
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import json

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.employee import UserAccount, Employee
from app.models.alert_engine import NotificationLog, AlertPreference, MeetingAlert, AnnouncementAlert
from app.core.notification_tasks import task_dispatch_announcement
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["Notifications V2"])

# SCHEMAS
class PreferenceUpdate(BaseModel):
    enabled_types: List[str]
    enabled_channels: List[str]
    late_threshold_minutes: int
    break_threshold_minutes: int
    ai_tracking_enabled: bool
    suppress_on_leave: bool
    suppress_on_holiday: bool

class MeetingCreate(BaseModel):
    title: str
    description: Optional[str]
    scheduled_at: datetime
    reminder_minutes: List[int]
    target_type: str
    participant_ids: List[str]

class AnnouncementCreate(BaseModel):
    title: str
    body: str
    priority: str
    target_type: str
    target_ids: List[str]
    scheduled_at: Optional[datetime]

# ENDPOINTS

@router.get("/notifications")
async def get_notifications(
    limit: int = 50,
    offset: int = 0,
    is_read: Optional[bool] = None,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(NotificationLog).where(NotificationLog.employee_id == current_user.employee_id)
    if is_read is not None:
        if is_read:
            query = query.where(NotificationLog.read_at.isnot(None))
        else:
            query = query.where(NotificationLog.read_at.is_(None))
            
    query = query.order_by(desc(NotificationLog.sent_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()
    
    count_result = await db.execute(select(func.count(NotificationLog.log_id)).where(NotificationLog.employee_id == current_user.employee_id))
    total_count = count_result.scalar_one()
    
    return {"total": total_count, "items": logs}

@router.patch("/notifications/{log_id}/read")
async def mark_read(
    log_id: uuid.UUID,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(NotificationLog).where(and_(NotificationLog.log_id == log_id, NotificationLog.employee_id == current_user.employee_id)))
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    log.read_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True}

@router.patch("/notifications/read-all")
async def mark_all_read(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(NotificationLog).where(and_(NotificationLog.employee_id == current_user.employee_id, NotificationLog.read_at.is_(None))))
    logs = result.scalars().all()
    now = datetime.now(timezone.utc)
    for log in logs:
        log.read_at = now
    await db.commit()
    return {"success": True, "count": len(logs)}

@router.get("/notifications/unread-count")
async def get_unread_count(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(func.count(NotificationLog.log_id)).where(and_(NotificationLog.employee_id == current_user.employee_id, NotificationLog.read_at.is_(None))))
    return {"count": result.scalar_one()}

@router.get("/notifications/preferences")
async def get_preferences(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(AlertPreference).where(AlertPreference.employee_id == current_user.employee_id))
    pref = result.scalar_one_or_none()
    if not pref:
        pref = AlertPreference(employee_id=current_user.employee_id)
        db.add(pref)
        await db.commit()
        await db.refresh(pref)
    return pref

@router.put("/notifications/preferences")
async def update_preferences(
    data: PreferenceUpdate,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(AlertPreference).where(AlertPreference.employee_id == current_user.employee_id))
    pref = result.scalar_one_or_none()
    if not pref:
        pref = AlertPreference(employee_id=current_user.employee_id)
        db.add(pref)
        
    pref.enabled_types = data.enabled_types
    pref.enabled_channels = data.enabled_channels
    pref.late_threshold_minutes = data.late_threshold_minutes
    pref.break_threshold_minutes = data.break_threshold_minutes
    pref.ai_tracking_enabled = data.ai_tracking_enabled
    pref.suppress_on_leave = data.suppress_on_leave
    pref.suppress_on_holiday = data.suppress_on_holiday
    
    await db.commit()
    return {"success": True}

@router.get("/notifications/analytics", dependencies=[Depends(require_roles(["SUPER_ADMIN", "HR_MANAGER"]))])
async def get_analytics(db: AsyncSession = Depends(get_db)):
    today = datetime.now(timezone.utc).date()
    
    # Total Sent Today
    sent_result = await db.execute(select(func.count(NotificationLog.log_id)).where(and_(func.date(NotificationLog.sent_at) == today, NotificationLog.status == "SENT")))
    total_sent = sent_result.scalar_one()
    
    # Suppressed Today
    supp_result = await db.execute(select(func.count(NotificationLog.log_id)).where(and_(func.date(NotificationLog.sent_at) == today, NotificationLog.status == "SUPPRESSED")))
    total_suppressed = supp_result.scalar_one()
    
    # By Type
    type_result = await db.execute(select(NotificationLog.triggered_by, func.count(NotificationLog.log_id)).where(func.date(NotificationLog.sent_at) == today).group_by(NotificationLog.triggered_by))
    by_type = {row[0]: row[1] for row in type_result.all()}
    
    return {
        "total_sent_today": total_sent,
        "suppressed_today": total_suppressed,
        "by_type": by_type,
        "top_alerted_employees": [] # requires a more complex query joining employee table. Leaving blank for mock.
    }

@router.post("/meetings", dependencies=[Depends(require_roles(["SUPER_ADMIN", "HR_MANAGER"]))])
async def create_meeting(
    data: MeetingCreate,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    meeting = MeetingAlert(
        title=data.title,
        description=data.description,
        scheduled_at=data.scheduled_at,
        reminder_minutes=data.reminder_minutes,
        created_by=current_user.employee_id,
        target_type=data.target_type,
        participant_ids=data.participant_ids
    )
    db.add(meeting)
    await db.commit()
    return {"success": True, "meeting_id": meeting.meeting_alert_id}

@router.get("/meetings", dependencies=[Depends(require_roles(["SUPER_ADMIN", "HR_MANAGER"]))])
async def get_meetings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MeetingAlert).where(MeetingAlert.is_active == True).order_by(desc(MeetingAlert.scheduled_at)))
    return result.scalars().all()

@router.delete("/meetings/{meeting_id}", dependencies=[Depends(require_roles(["SUPER_ADMIN", "HR_MANAGER"]))])
async def delete_meeting(meeting_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MeetingAlert).where(MeetingAlert.meeting_alert_id == meeting_id))
    meeting = result.scalar_one_or_none()
    if meeting:
        meeting.is_active = False
        await db.commit()
    return {"success": True}

@router.post("/announcements", dependencies=[Depends(require_roles(["SUPER_ADMIN", "HR_MANAGER"]))])
async def create_announcement(
    data: AnnouncementCreate,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    ann = AnnouncementAlert(
        title=data.title,
        body=data.body,
        priority=data.priority,
        created_by=current_user.employee_id,
        target_type=data.target_type,
        target_ids=data.target_ids,
        scheduled_at=data.scheduled_at
    )
    db.add(ann)
    await db.flush()
    
    if not data.scheduled_at:
        task_dispatch_announcement.delay(str(ann.announcement_alert_id))
    else:
        task_dispatch_announcement.apply_async(args=[str(ann.announcement_alert_id)], eta=data.scheduled_at)
        
    await db.commit()
    return {"success": True, "announcement_id": ann.announcement_alert_id}

@router.get("/announcements")
async def get_announcements(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role.name in ["SUPER_ADMIN", "HR_MANAGER"]:
        result = await db.execute(select(AnnouncementAlert).order_by(desc(AnnouncementAlert.created_at)))
        return result.scalars().all()
    else:
        # basic target logic
        query = select(AnnouncementAlert).where(AnnouncementAlert.target_type == "ALL")
        result = await db.execute(query.order_by(desc(AnnouncementAlert.created_at)))
        return result.scalars().all()
