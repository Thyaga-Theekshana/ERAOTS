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
    role_name: str = "EMPLOYEE"  # SUPER_ADMIN, HR_MANAGER, EMPLOYEE
    password: str = Field(..., min_length=6)

class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[UUID] = None
    fingerprint_id: Optional[str] = None
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


# ==================== PHASE C: CORRECTIONS ====================

class CorrectionRequestCreate(BaseModel):
    target_date: date
    correction_type: str  # MISSED_SCAN, WRONG_STATUS, SYSTEM_ERROR
    reason: str
    proposed_time: Optional[time] = None

class CorrectionRequestResponse(BaseModel):
    request_id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    target_date: date
    correction_type: str
    status: str
    reason: str
    proposed_time: Optional[time] = None
    resolved_by_id: Optional[UUID] = None
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
