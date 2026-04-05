"""
Schedule, leave, and holiday models (FR8).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Time, Integer, ForeignKey, Text
)
from app.core.types import GUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Schedule(Base):
    """Work shift definition (e.g., 'Standard 9-5')."""
    __tablename__ = "schedules"

    schedule_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    grace_period_min = Column(Integer, nullable=False, default=15)
    department_id = Column(GUID(), ForeignKey("departments.department_id"), nullable=True)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    department = relationship("Department", back_populates="schedules")
    employee_schedules = relationship("EmployeeSchedule", back_populates="schedule")

    def __repr__(self):
        return f"<Schedule {self.name} {self.start_time}-{self.end_time}>"


class EmployeeSchedule(Base):
    """Junction table: employee <-> schedule with effective dates."""
    __tablename__ = "employee_schedules"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    schedule_id = Column(GUID(), ForeignKey("schedules.schedule_id"), nullable=False)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee", back_populates="employee_schedules")
    schedule = relationship("Schedule", back_populates="employee_schedules")


class LeaveType(Base):
    """Leave categories (Annual, Sick, WFH, etc.)."""
    __tablename__ = "leave_types"

    leave_type_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), nullable=False, unique=True)
    max_days_per_year = Column(Integer, nullable=True)
    is_paid = Column(Boolean, default=True, nullable=False)
    requires_approval = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    leave_requests = relationship("LeaveRequest", back_populates="leave_type")

    def __repr__(self):
        return f"<LeaveType {self.name}>"


class LeaveRequest(Base):
    """Employee leave submission with approval workflow."""
    __tablename__ = "leave_requests"

    leave_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    leave_type_id = Column(GUID(), ForeignKey("leave_types.leave_type_id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, APPROVED, REJECTED, CANCELLED
    reviewed_by = Column(GUID(), ForeignKey("employees.employee_id"), nullable=True)
    review_comment = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee", back_populates="leave_requests", foreign_keys=[employee_id])
    leave_type = relationship("LeaveType", back_populates="leave_requests")
    reviewer = relationship("Employee", foreign_keys=[reviewed_by])

    def __repr__(self):
        return f"<LeaveRequest {self.employee_id} {self.start_date}-{self.end_date} status={self.status}>"


class Holiday(Base):
    """Company-wide holiday calendar."""
    __tablename__ = "holidays"

    holiday_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    holiday_date = Column(Date, nullable=False, unique=True)
    is_recurring = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<Holiday {self.name} {self.holiday_date}>"
