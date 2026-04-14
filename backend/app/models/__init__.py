"""
Models package — imports all models so SQLAlchemy discovers them.
"""
from app.models.employee import Employee, Department, Role, UserAccount
from app.models.events import (
    ScanEvent,
    OccupancyState,
    PendingStateTransition,
    EmployeeCalendarSettings,
    EmployeeTimezonePreference,
    SpecialMeeting,
    StatusLog,
    OCCUPANCY_STATUSES,
)
from app.models.attendance import AttendanceRecord
from app.models.schedule import Schedule, EmployeeSchedule, LeaveType, LeaveRequest, Holiday
from app.models.notifications import Notification, NotificationPreference
from app.models.corrections import CorrectionRequest
from app.models.policies import Policy
from app.models.emergency import EmergencyEvent, EmergencyHeadcount
from app.models.hardware import Scanner, ScannerHealthLog
from app.models.audit import AuditLog

__all__ = [
    "Employee", "Department", "Role", "UserAccount",
    "ScanEvent", "OccupancyState", "PendingStateTransition", "EmployeeCalendarSettings",
    "EmployeeTimezonePreference", "SpecialMeeting", "StatusLog", "OCCUPANCY_STATUSES",
    "AttendanceRecord",
    "Schedule", "EmployeeSchedule", "LeaveType", "LeaveRequest", "Holiday",
    "Notification", "NotificationPreference",
    "CorrectionRequest",
    "Policy",
    "EmergencyEvent", "EmergencyHeadcount",
    "Scanner", "ScannerHealthLog",
    "AuditLog",
]
