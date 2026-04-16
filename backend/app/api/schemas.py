"""
Pydantic schemas for request/response validation.
Shared across all API endpoints.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, date, time
from uuid import UUID


# ==================== AUTH ====================

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    role: str
    employee_name: str

class UserInfo(BaseModel):
    user_id: UUID
    employee_id: UUID
    email: str
    role: str
    full_name: str
    department: Optional[str] = None
    department_id: Optional[UUID] = None
    is_manager: bool = False
    managed_department_id: Optional[UUID] = None
    managed_department_name: Optional[str] = None
    phone: Optional[str] = None
    profile_image_url: Optional[str] = None
    job_title: Optional[str] = None  # Free-text job title (DevOps Engineer, QA Lead, etc.)
    permissions: dict = {}

    class Config:
        from_attributes = True


# ==================== EMPLOYEE ====================

class EmployeeCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = None
    department_id: Optional[UUID] = None
    fingerprint_id: Optional[str] = None
    hire_date: Optional[date] = None
    job_title: Optional[str] = None  # Free-text job role
    role_name: str = "EMPLOYEE"  # SUPER_ADMIN, HR_MANAGER, MANAGER, EMPLOYEE
    password: str = Field(..., min_length=6)

class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[UUID] = None
    fingerprint_id: Optional[str] = None
    job_title: Optional[str] = None  # Free-text, updateable (promotions)
    status: Optional[str] = None

class EmployeeResponse(BaseModel):
    employee_id: UUID
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    status: str
    hire_date: Optional[date] = None
    job_title: Optional[str] = None
    current_status: Optional[str] = "OUTSIDE"  # From OccupancyState
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== DEPARTMENT ====================

class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    manager_id: Optional[UUID] = None

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    manager_id: Optional[UUID] = None
    is_active: Optional[bool] = None

class DepartmentResponse(BaseModel):
    department_id: UUID
    name: str
    description: Optional[str] = None
    manager_id: Optional[UUID] = None
    is_active: bool
    employee_count: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== SCAN EVENT ====================

class ScanEventRequest(BaseModel):
    """Incoming scan from hardware/simulator."""
    scanner_id: UUID
    fingerprint_id: str
    timestamp: Optional[datetime] = None  # Defaults to server time if not provided

class ScanEventResponse(BaseModel):
    event_id: UUID
    scanner_id: UUID
    employee_id: Optional[UUID] = None
    employee_name: Optional[str] = None
    direction: str
    scan_timestamp: datetime
    is_valid: bool
    rejection_reason: Optional[str] = None
    door_name: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== OCCUPANCY ====================

class OccupancyOverview(BaseModel):
    total_inside: int
    total_capacity: int
    occupancy_percentage: float
    active_count: int
    in_meeting_count: int  # NEW: Employees in meetings
    on_break_count: int
    away_count: int
    outside_count: int

class EmployeeOccupancyState(BaseModel):
    employee_id: UUID
    employee_name: str
    department: Optional[str] = None
    current_status: str
    last_state_change: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== SCANNER ====================

class ScannerCreate(BaseModel):
    name: str
    door_name: str
    location_description: Optional[str] = None
    heartbeat_interval_sec: int = 60

class ScannerResponse(BaseModel):
    scanner_id: UUID
    name: str
    door_name: str
    status: str
    last_heartbeat: Optional[datetime] = None
    api_key: Optional[str] = None  # Only returned on creation

    class Config:
        from_attributes = True

# ==================== HARDWARE HEALTH MONITORING ====================

class ScannerHealthLogResponse(BaseModel):
    """Historical health log entry for a scanner."""
    log_id: UUID
    scanner_id: UUID
    status: str  # ONLINE, OFFLINE, DEGRADED
    response_time_ms: Optional[int] = None
    error_message: Optional[str] = None
    checked_at: datetime

    class Config:
        from_attributes = True


class ScannerHealthResponse(BaseModel):
    """Current health status of a scanner."""
    scanner_id: UUID
    name: str
    door_name: str
    status: str  # ONLINE, OFFLINE, DEGRADED
    last_heartbeat: Optional[datetime] = None
    heartbeat_interval_sec: int
    response_time_ms: Optional[int] = None
    error_count: int = 0
    
    class Config:
        from_attributes = True


class ScannerHealthHeartbeatRequest(BaseModel):
    """Incoming heartbeat from scanner device."""
    status: str = "ONLINE"  # ONLINE, OFFLINE, DEGRADED
    response_time_ms: Optional[int] = None
    error_message: Optional[str] = None
    battery_level: Optional[int] = None


class ScannerHealthStatsResponse(BaseModel):
    """Summary statistics of all scanners."""
    total_scanners: int
    online: int
    offline: int
    degraded: int
    average_response_time_ms: float
    error_count_today: int
    uptime_percentage: float
    
    class Config:
        from_attributes = True

# ==================== DASHBOARD ====================

class DashboardData(BaseModel):
    occupancy: OccupancyOverview
    recent_events: List[ScanEventResponse]
    scanner_statuses: List[ScannerResponse]


# ==================== GENERIC ====================

class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None


# ==================== PHASE C: SCHEDULES & LEAVE ====================

class LeaveRequestCreate(BaseModel):
    leave_type_id: UUID
    start_date: date
    end_date: date
    reason: Optional[str] = None

class LeaveRequestResponse(BaseModel):
    request_id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    leave_type_id: UUID
    leave_type_name: Optional[str] = None
    start_date: date
    end_date: date
    status: str
    reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LeaveUsageSummary(BaseModel):
    leave_type_id: UUID
    leave_type_name: str
    used_days: int
    remaining_days: Optional[int] = None
    max_days_per_year: Optional[int] = None
    warning_level: str = "NONE"  # NONE, NEAR_LIMIT, EXCEEDED


class LeaveCalendarEntry(BaseModel):
    request_id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    leave_type_name: Optional[str] = None
    start_date: date
    end_date: date
    status: str


# ==================== PHASE C: CORRECTIONS ====================

class CorrectionRequestCreate(BaseModel):
    correction_date: date
    correction_type: str  # MISSED_SCAN, WRONG_SCAN, OTHER
    reason: str
    proposed_time: datetime

class CorrectionRequestResponse(BaseModel):
    request_id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    correction_date: date
    correction_type: str
    status: str
    reason: str
    proposed_time: datetime
    reviewed_by: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True

# ==================== PHASE C: NOTIFICATIONS ====================

class NotificationResponse(BaseModel):
    notification_id: UUID
    user_id: UUID
    title: str
    message: str
    notification_type: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

# ==================== PHASE D: EMERGENCY ====================

class EmergencyEventCreate(BaseModel):
    emergency_type: str  # FIRE, DRILL, SECURITY_THREAT, OTHER
    notes: Optional[str] = None

class EmergencyHeadcountResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    status_at_event: str
    accounted_for: bool
    last_known_door: Optional[str] = None
    accounted_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class EmergencyEventResponse(BaseModel):
    emergency_id: UUID
    activated_by: UUID
    activator_name: Optional[str] = None
    activation_time: datetime
    deactivation_time: Optional[datetime] = None
    emergency_type: str
    headcount_at_activation: int
    notes: Optional[str] = None
    status: str
    headcount_entries: List[EmergencyHeadcountResponse] = []

    class Config:
        from_attributes = True

# ==================== PHASE D: SYSTEM SETTINGS ====================

class PolicyUpdate(BaseModel):
    value: dict

class PolicyResponse(BaseModel):
    policy_id: UUID
    name: str
    policy_type: str
    value: dict
    is_active: bool
    
    class Config:
        from_attributes = True


# ==================== HYBRID STATUS TRACKING ====================

class StatusOverrideRequest(BaseModel):
    """Manual portal toggle for status override (Hierarchy of Truth: High Priority)."""
    status: str = Field(..., description="Target status: ACTIVE or IN_MEETING")

class StatusOverrideResponse(BaseModel):
    employee_id: UUID
    previous_status: str
    new_status: str
    change_source: str
    changed_at: datetime

    class Config:
        from_attributes = True


class PendingTransitionResponse(BaseModel):
    """Pending calendar-triggered state transition (30-second rule)."""
    transition_id: UUID
    employee_id: UUID
    trigger_source: str
    calendar_event_title: Optional[str] = None
    from_status: str
    to_status: str
    triggered_at: datetime
    expires_at: datetime
    seconds_remaining: int
    status: str
    notification_id: Optional[UUID] = None

    class Config:
        from_attributes = True


class TransitionActionRequest(BaseModel):
    """User action on a pending transition."""
    action: str = Field(..., description="Action: CONFIRM or CANCEL")


class TransitionActionResponse(BaseModel):
    transition_id: UUID
    action_taken: str
    new_status: str
    message: str

    class Config:
        from_attributes = True


class CalendarSettingsUpdate(BaseModel):
    """Update employee calendar settings."""
    provider: Optional[str] = None  # GOOGLE, MICROSOFT, ICAL, NONE
    is_enabled: Optional[bool] = None
    timezone: Optional[str] = None
    organization_timezone: Optional[str] = None
    ical_url: Optional[str] = None
    sync_enabled: Optional[bool] = None
    auto_transition_enabled: Optional[bool] = None


class CalendarSettingsResponse(BaseModel):
    settings_id: UUID
    employee_id: UUID
    provider: str
    is_enabled: bool
    sync_enabled: bool
    auto_transition_enabled: bool
    timezone: Optional[str] = None
    organization_timezone: Optional[str] = None
    ical_url: Optional[str] = None
    last_sync_at: Optional[datetime] = None
    sync_error: Optional[str] = None

    class Config:
        from_attributes = True


class SpecialMeetingCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    start_at: datetime
    timezone: str = Field(default="Asia/Colombo")
    duration_min: int = Field(default=30, ge=5, le=480)
    is_important: bool = True
    notes: Optional[str] = None


class SpecialMeetingResponse(BaseModel):
    meeting_id: UUID
    title: str
    notes: Optional[str] = None
    start_at_utc: datetime
    start_at_local: datetime
    timezone: str
    organization_timezone: str
    duration_min: int
    is_important: bool
    status: str
    notified_count: int = 0
    triggered_at: Optional[datetime] = None
    created_at: datetime


class ActionableNotificationResponse(BaseModel):
    """Notification with interactive action buttons."""
    notification_id: UUID
    title: str
    message: str
    type: str
    priority: str
    is_actionable: bool
    action_type: Optional[str] = None
    action_metadata: Optional[dict] = None
    action_taken: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


        
# ==================== HARDWARE / FR13 ====================

class ScannerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    door_name: str = Field(..., min_length=1, max_length=100)
    location_description: Optional[str] = None
    heartbeat_interval_sec: Optional[int] = 60

class ScannerResponse(BaseModel):
    scanner_id: UUID
    name: str
    door_name: str
    location_description: Optional[str] = None
    status: str  # ONLINE, DEGRADED, OFFLINE
    last_heartbeat: Optional[datetime] = None
    api_key: Optional[str] = None  # Only on creation
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ScannerHeartbeatRequest(BaseModel):
    """Device sends heartbeat with performance metrics."""
    response_time_ms: Optional[int] = None
    error_message: Optional[str] = None
    buffer_size: Optional[int] = 0  # Number of buffered events


class ScannerHeartbeatResponse(BaseModel):
    scanner_id: UUID
    status: str
    message: str
    server_time: datetime


class ScannerHealthResponse(BaseModel):
    """Current health snapshot of a scanner."""
    scanner_id: UUID
    name: str
    door_name: str
    status: str
    last_heartbeat: Optional[datetime] = None
    uptime_percentage: float
    error_rate_pct: float
    total_scans: int = 0
    failed_scans: int = 0
    installed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ScannerHealthHistoryResponse(BaseModel):
    """Historical health log entry."""
    log_id: UUID
    scanner_id: UUID
    status: str
    response_time_ms: Optional[int] = None
    error_message: Optional[str] = None
    checked_at: datetime

    class Config:
        from_attributes = True


class BufferedEventData(BaseModel):
    """Single event from device buffer."""
    fingerprint_id: str
    timestamp: datetime
    direction: str  # IN, OUT


class ScannerBufferSyncRequest(BaseModel):
    """Device syncs buffered events while offline."""
    events: List[BufferedEventData] = []
    buffer_clear_requested: bool = False


class BufferConflict(BaseModel):
    """Conflict detected during buffer sync."""
    event_index: int
    reason: str  # DUPLICATE, VALIDATION_FAILED, etc.


class ScannerBufferSyncResponse(BaseModel):
    """Result of buffer sync operation."""
    scanner_id: UUID
    events_received: int
    events_processed: int
    conflicts_detected: int
    conflicts: List[BufferConflict] = []
    message: str
