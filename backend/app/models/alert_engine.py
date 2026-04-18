import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Integer, Text
)
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.core.types import GUID, JSONType

class NotificationTemplate(Base):
    __tablename__ = "notification_templates"

    template_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)  # LATE_ARRIVAL, ABSENT, EARLY_EXIT, etc.
    title_template = Column(String(200), nullable=False)
    body_template = Column(Text, nullable=False)
    priority = Column(String(20), nullable=False, default="LOW")
    channels = Column(JSONType(), nullable=False, default=lambda: ["in_app", "email", "whatsapp"])
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class NotificationLog(Base):
    __tablename__ = "notification_logs"

    log_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    triggered_by = Column(String(50), nullable=False)  # alert type string
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    priority = Column(String(20), nullable=False)
    channel = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False)  # SENT, FAILED, SUPPRESSED
    suppression_reason = Column(String(50), nullable=True)  # ON_LEAVE, HOLIDAY, etc.
    
    sent_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    read_at = Column(DateTime(timezone=True), nullable=True)

    employee = relationship("Employee")

class AlertPreference(Base):
    """Replaces NotificationPreference per step 1 without destroying the old table."""
    __tablename__ = "alert_preferences"

    preference_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False, unique=True)
    enabled_types = Column(JSONType(), nullable=False, default=lambda: [
        "LATE_ARRIVAL", "ABSENT", "EARLY_EXIT", "FREQUENT_LATENESS", 
        "LONG_BREAK", "MISSED_EXIT", "DEVICE_OFFLINE", "UNAUTHORIZED", 
        "OVER_CAPACITY", "MEETING_REMINDER", "ANNOUNCEMENT"
    ])
    enabled_channels = Column(JSONType(), nullable=False, default=lambda: ["in_app", "email"])
    
    late_threshold_minutes = Column(Integer, default=0, nullable=False)
    break_threshold_minutes = Column(Integer, default=30, nullable=False)
    
    ai_tracking_enabled = Column(Boolean, default=True, nullable=False)
    suppress_on_leave = Column(Boolean, default=True, nullable=False)
    suppress_on_holiday = Column(Boolean, default=True, nullable=False)

    employee = relationship("Employee")

class MeetingAlert(Base):
    __tablename__ = "meeting_alerts"

    meeting_alert_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=False)
    
    reminder_minutes = Column(JSONType(), nullable=False, default=lambda: [10, 60])
    created_by = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    
    target_type = Column(String(20), nullable=False, default="SELECTED")  # ALL, DEPARTMENT, SELECTED
    participant_ids = Column(JSONType(), nullable=False, default=list)
    
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    creator = relationship("Employee")

class AnnouncementAlert(Base):
    __tablename__ = "announcement_alerts"

    announcement_alert_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    priority = Column(String(20), nullable=False, default="LOW")
    
    created_by = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    target_type = Column(String(20), nullable=False, default="ALL")  # ALL, DEPARTMENT, SELECTED
    target_ids = Column(JSONType(), nullable=False, default=list)
    
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    creator = relationship("Employee")
