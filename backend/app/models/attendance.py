"""
Processed daily attendance records.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Integer, ForeignKey, Index
)
from app.core.types import GUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class AttendanceRecord(Base):
    """
    Processed daily summary per employee.
    Computed from scan events at end-of-day or on-demand (FR4).
    """
    __tablename__ = "attendance_records"

    record_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    attendance_date = Column(Date, nullable=False)
    first_entry = Column(DateTime(timezone=True), nullable=True)
    last_exit = Column(DateTime(timezone=True), nullable=True)
    total_time_in_building_min = Column(Integer, nullable=True, default=0)
    total_active_time_min = Column(Integer, nullable=True, default=0)
    break_count = Column(Integer, nullable=True, default=0)
    total_break_duration_min = Column(Integer, nullable=True, default=0)
    status = Column(String(20), nullable=False, default="PRESENT")  # PRESENT, ABSENT, HALF_DAY, LEAVE, HOLIDAY
    is_late = Column(Boolean, nullable=False, default=False)
    late_duration_min = Column(Integer, nullable=True, default=0)
    overtime_duration_min = Column(Integer, nullable=True, default=0)
    punctuality_score = Column(Integer, nullable=True)  # 0-100 (FR12.6)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee", back_populates="attendance_records")

    # Indexes
    __table_args__ = (
        Index("ix_attendance_employee_date", "employee_id", "attendance_date", unique=True),
        Index("ix_attendance_date_status", "attendance_date", "status"),
    )

    def __repr__(self):
        return f"<AttendanceRecord employee={self.employee_id} date={self.attendance_date} status={self.status}>"
