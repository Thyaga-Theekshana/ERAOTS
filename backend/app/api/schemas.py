"""
Pydantic schemas for request/response validation.
Shared across all API endpoints.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, date
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
    # Free-text job title (DevOps Engineer, QA Lead, etc.)
    job_title: Optional[str] = None
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
    # Defaults to server time if not provided
    timestamp: Optional[datetime] = None


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
    name: str = Field(..., min_length=1, max_length=100)
    door_name: str = Field(..., min_length=1, max_length=100)
    location_description: Optional[str] = None
    heartbeat_interval_sec: Optional[int] = 60


class ScannerResponse(BaseModel):
    scanner_id: UUID
    name: str
    door_name: str
    location_description: Optional[str] = None
    status: str
    last_heartbeat: Optional[datetime] = None
    api_key: Optional[str] = None  # Only returned on creation
    created_at: Optional[datetime] = None

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
    """Current health snapshot of a scanner."""
    scanner_id: UUID
    name: str
    door_name: str
    status: str
    last_heartbeat: Optional[datetime] = None
    heartbeat_interval_sec: Optional[int] = None
    response_time_ms: Optional[int] = None
    error_count: int = 0
    uptime_percentage: Optional[float] = None
    error_rate_pct: Optional[float] = None
    total_scans: int = 0
    failed_scans: int = 0
    installed_at: Optional[datetime] = None

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
    review_comment: Optional[str] = None
    reviewed_at: Optional[datetime] = None
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


class LeaveHolidayEntry(BaseModel):
    holiday_id: UUID
    name: str
    holiday_date: date


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
    safety_check_sent: bool = False

    class Config:
        from_attributes = True

# ==================== SAFETY CHECK ====================


class SafetyCheckSendRequest(BaseModel):
    """Admin triggers 'Are you safe?' to all employees."""
    message: Optional[str] = "Are you safe? Please respond immediately."


class SafetyCheckRespondRequest(BaseModel):
    """Employee replies to safety check."""
    response: str  # "YES" or "NO"


class SafetyCheckEmployeeResponse(BaseModel):
    """Individual employee's safety check response."""
    id: UUID
    employee_id: UUID
    employee_name: str
    department_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str  # PENDING, SAFE, IN_DANGER
    responded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SafetyCheckOverview(BaseModel):
    """Overview of all safety check responses for an emergency."""
    emergency_id: UUID
    total_employees: int
    safe_count: int
    in_danger_count: int
    pending_count: int
    responses: List[SafetyCheckEmployeeResponse] = []

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


# ==================== PERSONAL INSIGHTS (FR10, FR12) ====================

class PunctualityScoreResponse(BaseModel):
    """Punctuality KPI: 0-100 score with grade and trend."""
    score: int = 0
    grade: str = "N/A"
    on_time_rate: float = 0.0
    late_days: int = 0
    total_days: int = 0
    trend: str = "STABLE"  # IMPROVING, STABLE, DECLINING
    avg_late_min: float = 0.0
    streak_on_time: int = 0


class DeskVsBuildingEntry(BaseModel):
    """Single day entry comparing desk time to building time."""
    date: date
    desk_minutes: int = 0
    building_minutes: int = 0
    break_minutes: int = 0
    meeting_minutes: int = 0
    productivity_ratio: float = 0.0


class LateRiskPrediction(BaseModel):
    """Late risk prediction based on day-of-week historical patterns."""
    risk_level: str = "LOW"  # LOW, MODERATE, HIGH
    risk_percentage: float = 0.0
    predicted_day: str = ""
    predicted_date: Optional[date] = None
    contributing_factors: List[str] = []
    recommendation: str = ""
    day_risks: dict = {}  # {"Monday": 12.5, "Tuesday": 30.0, ...}


class ArrivalTrendEntry(BaseModel):
    """Daily arrival time data point for trend charting."""
    date: date
    arrival_time: Optional[str] = None
    arrival_hour: Optional[float] = None  # e.g. 8.75 = 8:45 AM
    scheduled_start: Optional[str] = None
    deviation_min: int = 0
    was_late: bool = False


class MonthlyTrendEntry(BaseModel):
    """Monthly aggregated attendance metrics."""
    month: str  # "2026-04"
    month_label: str  # "April 2026"
    present_days: int = 0
    late_days: int = 0
    absent_days: int = 0
    avg_hours: float = 0.0
    avg_punctuality: int = 0
    total_overtime_min: int = 0


class PersonalInsightsSummary(BaseModel):
    """Quick-glance summary stats."""
    avg_arrival_time: Optional[str] = None
    avg_daily_hours: float = 0.0
    total_hours_this_month: float = 0.0
    days_present_this_month: int = 0
    current_streak: int = 0
    best_day: Optional[str] = None
    most_productive_day: Optional[str] = None


class PersonalInsightsResponse(BaseModel):
    """Complete personal insights payload."""
    punctuality: PunctualityScoreResponse
    desk_vs_building: List[DeskVsBuildingEntry] = []
    late_risk: LateRiskPrediction
    arrival_trends: List[ArrivalTrendEntry] = []
    monthly_trends: List[MonthlyTrendEntry] = []
    summary: PersonalInsightsSummary


# ==================== TEAM INSIGHTS (MANAGER) ====================

class CoverageGapKPI(BaseModel):
    """Coverage KPI for required vs actual in-office headcount."""
    required_headcount: int = 0
    actual_headcount: int = 0
    gap: int = 0
    coverage_rate_pct: float = 0.0
    status: str = "UNDERSTAFFED"  # FULLY_COVERED, PARTIALLY_COVERED, UNDERSTAFFED


class LateClusterAlert(BaseModel):
    """Late-coming clustering insight by weekday or scanner."""
    cluster_type: str  # DAY_OF_WEEK, SCANNER
    label: str
    occurrences: int = 0
    total_days: int = 0
    rate_pct: float = 0.0
    severity: str = "LOW"  # LOW, MODERATE, HIGH
    alert_message: str


class TeamAnomalyFeedItem(BaseModel):
    """Single anomaly feed item for immediate manager awareness."""
    anomaly_type: str  # MISSED_SCAN, UNUSUAL_HOURS, EXCESSIVE_LATE, REPEATED_LATE
    severity: str = "MEDIUM"  # LOW, MEDIUM, HIGH
    employee_id: Optional[UUID] = None
    employee_name: Optional[str] = None
    date: Optional[date] = None
    message: str


class TeamInsightsResponse(BaseModel):
    """Manager-facing team insights payload."""
    department_id: UUID
    days_analyzed: int
    coverage: CoverageGapKPI
    late_clusters: List[LateClusterAlert] = []
    anomaly_feed: List[TeamAnomalyFeedItem] = []


# ==================== COMPANY INSIGHTS (HR MANAGER, FR12) ====================

class HeatmapCell(BaseModel):
    """Single cell in the peak-hours heatmap: hour × day_of_week traffic count."""
    hour: int           # 0–23
    day_of_week: int    # 0=Monday … 6=Sunday
    day_name: str
    count: int = 0


class PolicySimPoint(BaseModel):
    """Single point in the policy impact simulation curve."""
    office_start_offset_min: int   # Relative to current start (–60 to +60)
    label: str                     # Human-readable e.g. "8:30 AM (-30 min)"
    simulated_late_rate: float     # Projected late rate as a percentage
    late_count_delta: int          # Change vs current policy (negative = improvement)


class DeptComparisonEntry(BaseModel):
    """Aggregated attendance metrics for a single department."""
    department_name: str
    avg_punctuality_score: float = 0.0
    late_rate_pct: float = 0.0
    avg_daily_hours: float = 0.0
    total_overtime_min: int = 0
    employee_count: int = 0


class CompanyInsightsResponse(BaseModel):
    """Complete company-wide insights payload for HR Managers (FR12.1, FR12.4)."""
    days_analyzed: int
    heatmap: List[HeatmapCell] = []
    policy_sim: List[PolicySimPoint] = []
    department_comparison: List[DeptComparisonEntry] = []
    current_office_start: str = "09:00"
    current_late_rate_pct: float = 0.0
    total_employees_analyzed: int = 0


# ==================== SYSTEM INSIGHTS (SUPER_ADMIN, FR13, NFR6) ====================

class DataQualityKPI(BaseModel):
    """Scan data integrity metrics for the Data Quality Dashboard."""
    total_scans: int = 0
    valid_scans: int = 0
    invalid_scans: int = 0
    duplicate_scans: int = 0
    unregistered_attempts: int = 0
    valid_rate_pct: float = 0.0
    by_source: dict = {}       # e.g. {"HARDWARE": 120, "SIMULATOR": 40}
    by_scanner: list = []      # [{"scanner_name": str, "count": int, "invalid_count": int}]


class HardwareHealthSummary(BaseModel):
    """Aggregated hardware health KPIs across all scanners."""
    total_scanners: int = 0
    online_count: int = 0
    degraded_count: int = 0
    offline_count: int = 0
    system_uptime_pct: float = 0.0
    avg_response_time_ms: float = 0.0
    scanners_with_high_error_rate: int = 0   # error_rate > 5%
    scanners: list = []        # per-scanner detail rows


class SecurityAlertItem(BaseModel):
    """Single security alert (unauthorized access or off-hours scan)."""
    alert_type: str            # UNAUTHORIZED, OFF_HOURS, REPEATED_UNAUTHORIZED
    scanner_name: str
    door_name: str
    scan_timestamp: datetime
    fingerprint_hint: str      # first 8 chars of hash for display (not sensitive)
    severity: str = "HIGH"     # HIGH, CRITICAL


class AuditFeedItem(BaseModel):
    """Single audit log entry for the admin audit feed."""
    audit_id: UUID
    action: str
    entity_type: str
    actor_name: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime


class SystemInsightsResponse(BaseModel):
    """Complete Super Admin system insights payload (FR13, NFR6)."""
    days_analyzed: int
    data_quality: DataQualityKPI
    hardware_health: HardwareHealthSummary
    security_alerts: List[SecurityAlertItem] = []
    audit_feed: List[AuditFeedItem] = []
    generated_at: datetime
