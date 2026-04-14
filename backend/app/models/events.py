"""
Scan event and real-time occupancy state models.
ScanEvent is IMMUTABLE — the audit log backbone (NFR2).

Hybrid "Away vs On-Desk" Architecture:
- PendingStateTransition: Tracks 30-second calendar-triggered confirmations
- EmployeeCalendarSettings: Maps external calendar providers
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Index, Integer
)
from app.core.types import GUID, JSONType
from sqlalchemy.orm import relationship
from app.core.database import Base


# Valid occupancy statuses
OCCUPANCY_STATUSES = ("OUTSIDE", "ACTIVE", "ON_BREAK", "AWAY", "IN_MEETING")


class ScanEvent(Base):
    """
    Immutable record of every fingerprint scan.
    NEVER modify or delete rows in this table (NFR2.2).
    """
    __tablename__ = "scan_events"

    event_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    scanner_id = Column(GUID(), ForeignKey("scanners.scanner_id"), nullable=False)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=True)
    fingerprint_hash = Column(String(64), nullable=False)
    scan_timestamp = Column(DateTime(timezone=True), nullable=False)
    direction = Column(String(10), nullable=False)  # IN, OUT
    event_source = Column(String(20), nullable=False, default="HARDWARE")  # HARDWARE, MANUAL_CORRECTION, AUTO_CHECKOUT, SIMULATOR
    is_valid = Column(Boolean, nullable=False, default=True)
    rejection_reason = Column(String(100), nullable=True)  # UNREGISTERED, DUPLICATE, SCANNER_ERROR
    raw_data = Column(JSONType(), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee", back_populates="scan_events")
    scanner = relationship("Scanner", back_populates="scan_events")

    # Indexes for performance (matching ER Diagram indexing strategy)
    __table_args__ = (
        Index("ix_scan_events_employee_timestamp", "employee_id", "scan_timestamp"),
        Index("ix_scan_events_scanner_timestamp", "scanner_id", "scan_timestamp"),
        Index("ix_scan_events_timestamp", "scan_timestamp"),
    )

    def __repr__(self):
        return f"<ScanEvent {self.direction} employee={self.employee_id} at {self.scan_timestamp}>"


class OccupancyState(Base):
    """
    Real-time state cache — one row per employee.
    Updated on every valid scan event. Mirrored in Redis for speed (NFR5.6).
    
    Hierarchy of Truth for status changes:
    1. Biometric Scan OUT (Ultimate Priority) - forces OUTSIDE, aborts pending transitions
    2. Manual Portal Toggle (High Priority) - overrides calendar syncing
    3. Interactive Calendar Sync (Medium Priority) - 30-second confirmation rule
    
    Valid statuses: OUTSIDE, ACTIVE, ON_BREAK, AWAY, IN_MEETING
    """
    __tablename__ = "occupancy_states"

    state_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False, unique=True)
    current_status = Column(String(20), nullable=False, default="OUTSIDE")  # OUTSIDE, ACTIVE, ON_BREAK, AWAY, IN_MEETING
    last_scan_event_id = Column(GUID(), ForeignKey("scan_events.event_id"), nullable=True)
    last_state_change = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # Track source of last state change for hierarchy enforcement
    last_change_source = Column(String(30), nullable=False, default="BIOMETRIC")  # BIOMETRIC, MANUAL, CALENDAR_SYNC
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee", back_populates="occupancy_state")
    last_scan_event = relationship("ScanEvent")

    # Index for counting by status
    __table_args__ = (
        Index("ix_occupancy_states_status", "current_status"),
    )

    def __repr__(self):
        return f"<OccupancyState employee={self.employee_id} status={self.current_status}>"


class PendingStateTransition(Base):
    """
    Tracks 30-second calendar-triggered confirmations (The Interceptor).
    
    When a synced calendar meeting starts and the employee is IN the building:
    1. Backend creates a PendingStateTransition with status PENDING
    2. Employee receives actionable notification with [Cancel] / [Confirm Now]
    3. After 30 seconds (or user action), transition is executed or aborted
    
    The 30-Second Rule:
    - [Cancel] → status = CANCELLED, employee stays ACTIVE
    - [Confirm Now] → status = CONFIRMED, employee becomes IN_MEETING
    - Timeout (30s) → status = AUTO_CONFIRMED, employee becomes IN_MEETING
    - Biometric OUT → status = ABORTED, employee becomes OUTSIDE
    """
    __tablename__ = "pending_state_transitions"

    transition_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    
    # What triggered this transition
    trigger_source = Column(String(30), nullable=False)  # CALENDAR_SYNC, MANUAL_REQUEST
    calendar_event_id = Column(String(255), nullable=True)  # External calendar event ID
    calendar_event_title = Column(String(500), nullable=True)  # Meeting title for notification
    
    # State transition details
    from_status = Column(String(20), nullable=False)  # Current status when triggered
    to_status = Column(String(20), nullable=False)  # Target status (e.g., IN_MEETING)
    
    # Timing
    triggered_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=False)  # triggered_at + 30 seconds
    resolved_at = Column(DateTime(timezone=True), nullable=True)  # When action was taken
    
    # Resolution
    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, CONFIRMED, CANCELLED, AUTO_CONFIRMED, ABORTED
    resolution_source = Column(String(30), nullable=True)  # USER_CONFIRM, USER_CANCEL, TIMEOUT, BIOMETRIC_OUT
    
    # Link to the notification sent
    notification_id = Column(GUID(), ForeignKey("notifications.notification_id"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee")
    notification = relationship("Notification")

    __table_args__ = (
        Index("ix_pending_transitions_employee_status", "employee_id", "status"),
        Index("ix_pending_transitions_expires", "expires_at"),
    )

    def __repr__(self):
        return f"<PendingStateTransition {self.employee_id} {self.from_status}->{self.to_status} status={self.status}>"


class StatusLog(Base):
    """
    Immutable audit log of every employee status transition.
    
    This is the source of truth for calculating "active hours" vs "total building time".
    Every status change — whether from a biometric scan, manual portal toggle, or
    calendar sync — is recorded here with a precise timestamp.
    
    Example: Employee enters @9am (OUTSIDE→ACTIVE), takes a break @11am (ACTIVE→ON_BREAK),
    returns @11:20am (ON_BREAK→ACTIVE), enters meeting @2pm (ACTIVE→IN_MEETING), 
    leaves building @5pm (IN_MEETING→OUTSIDE).
    
    The attendance processor sums up durations by status to compute:
    - total_active_time_min  = ACTIVE periods
    - total_meeting_time_min = IN_MEETING periods
    - total_break_duration_min = ON_BREAK + AWAY periods while inside
    - total_time_in_building_min = last_exit - first_entry
    """
    __tablename__ = "status_logs"

    log_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)

    # The status the employee transitioned FROM and TO
    from_status = Column(String(20), nullable=True)   # NULL for the very first entry ever
    to_status = Column(String(20), nullable=False)

    # When the transition happened
    changed_at = Column(DateTime(timezone=True), nullable=False)

    # What triggered this change
    source = Column(String(30), nullable=False)  # BIOMETRIC, MANUAL, CALENDAR_SYNC, AUTO_CONFIRM, SYSTEM

    # Optional: link to the scan event that caused this (for biometric changes)
    scan_event_id = Column(GUID(), ForeignKey("scan_events.event_id"), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee", back_populates="status_logs")
    scan_event = relationship("ScanEvent")

    # Indexes for fast per-employee per-day queries
    __table_args__ = (
        Index("ix_status_logs_employee_changed", "employee_id", "changed_at"),
        Index("ix_status_logs_changed_at", "changed_at"),
    )

    def __repr__(self):
        return (
            f"<StatusLog employee={self.employee_id} "
            f"{self.from_status}→{self.to_status} at {self.changed_at} via {self.source}>"
        )


class EmployeeCalendarSettings(Base):
    """
    Maps external calendar providers for each employee.
    Supports Google Calendar, Microsoft Outlook, and iCal feeds.
    """
    __tablename__ = "employee_calendar_settings"

    settings_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False, unique=True)
    
    # Calendar provider configuration
    provider = Column(String(30), nullable=False)  # GOOGLE, MICROSOFT, ICAL, NONE
    is_enabled = Column(Boolean, nullable=False, default=True)
    
    # OAuth tokens (encrypted in production)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)
    
    # For iCal feeds
    ical_url = Column(String(1000), nullable=True)
    
    # Sync settings
    sync_enabled = Column(Boolean, nullable=False, default=True)
    auto_transition_enabled = Column(Boolean, nullable=False, default=True)  # Enable 30-sec rule
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    sync_error = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee")

    def __repr__(self):
        return f"<EmployeeCalendarSettings employee={self.employee_id} provider={self.provider}>"


class EmployeeTimezonePreference(Base):
    """Stores client and organization timezone preferences for scheduling views."""
    __tablename__ = "employee_timezone_preferences"

    preference_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False, unique=True)
    client_timezone = Column(String(100), nullable=False, default="Asia/Colombo")
    organization_timezone = Column(String(100), nullable=False, default="Asia/Colombo")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    employee = relationship("Employee")

    def __repr__(self):
        return f"<EmployeeTimezonePreference employee={self.employee_id} client={self.client_timezone}>"


class SpecialMeeting(Base):
    """Special meeting schedule with targeted notifications for important staff."""
    __tablename__ = "special_meetings"

    meeting_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    created_by_employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    title = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    start_at_utc = Column(DateTime(timezone=True), nullable=False)
    timezone = Column(String(100), nullable=False, default="Asia/Colombo")
    organization_timezone = Column(String(100), nullable=False, default="Asia/Colombo")
    duration_min = Column(Integer, nullable=False, default=30)
    is_important = Column(Boolean, nullable=False, default=True)
    status = Column(String(20), nullable=False, default="SCHEDULED")  # SCHEDULED, TRIGGERED, CANCELLED
    target_roles = Column(JSONType(), nullable=True)  # ["HR_MANAGER", "MANAGER", ...]
    triggered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    created_by = relationship("Employee")

    __table_args__ = (
        Index("ix_special_meetings_created_by", "created_by_employee_id"),
        Index("ix_special_meetings_start_at", "start_at_utc"),
    )

    def __repr__(self):
        return f"<SpecialMeeting {self.title} at {self.start_at_utc}>"
