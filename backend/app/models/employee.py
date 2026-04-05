"""
Core employee, department, role, and user account models.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, ForeignKey, Text, Enum as SAEnum
)
from app.core.types import GUID, JSONType
from sqlalchemy.orm import relationship
from app.core.database import Base


class Department(Base):
    __tablename__ = "departments"

    department_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    manager_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    employees = relationship("Employee", back_populates="department", foreign_keys="Employee.department_id")
    manager = relationship("Employee", foreign_keys=[manager_id])
    schedules = relationship("Schedule", back_populates="department")
    policies = relationship("Policy", back_populates="department")

    def __repr__(self):
        return f"<Department {self.name}>"


class Employee(Base):
    __tablename__ = "employees"

    employee_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    phone = Column(String(20), nullable=True)
    department_id = Column(GUID(), ForeignKey("departments.department_id"), nullable=True)
    fingerprint_hash = Column(String(64), nullable=True, unique=True, index=True)
    profile_image_url = Column(String(500), nullable=True)
    hire_date = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default="ACTIVE")  # ACTIVE, INACTIVE, TERMINATED
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    department = relationship("Department", back_populates="employees", foreign_keys=[department_id])
    user_account = relationship("UserAccount", back_populates="employee", uselist=False)
    scan_events = relationship("ScanEvent", back_populates="employee")
    occupancy_state = relationship("OccupancyState", back_populates="employee", uselist=False)
    attendance_records = relationship("AttendanceRecord", back_populates="employee")
    leave_requests = relationship("LeaveRequest", back_populates="employee", foreign_keys="LeaveRequest.employee_id")
    notifications = relationship("Notification", back_populates="recipient")
    notification_preference = relationship("NotificationPreference", back_populates="employee", uselist=False)
    correction_requests = relationship("CorrectionRequest", back_populates="employee", foreign_keys="CorrectionRequest.employee_id")
    employee_schedules = relationship("EmployeeSchedule", back_populates="employee")

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    def __repr__(self):
        return f"<Employee {self.full_name}>"


class Role(Base):
    __tablename__ = "roles"

    role_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), nullable=False, unique=True)  # SUPER_ADMIN, HR_MANAGER, EMPLOYEE
    description = Column(Text, nullable=True)
    permissions = Column(JSONType(), nullable=True, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    user_accounts = relationship("UserAccount", back_populates="role")

    def __repr__(self):
        return f"<Role {self.name}>"


class UserAccount(Base):
    __tablename__ = "user_accounts"

    user_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False, unique=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role_id = Column(GUID(), ForeignKey("roles.role_id"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    mfa_secret = Column(String(255), nullable=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee", back_populates="user_account")
    role = relationship("Role", back_populates="user_accounts")
    audit_logs = relationship("AuditLog", back_populates="user")

    def __repr__(self):
        return f"<UserAccount {self.email}>"
