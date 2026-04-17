"""
Attendance correction request model (FR14).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, Date, ForeignKey, Text
)
from app.core.types import GUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class CorrectionRequest(Base):
    """Employee-submitted correction for missed/wrong scans."""
    __tablename__ = "correction_requests"

    correction_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    correction_date = Column(Date, nullable=False)
    original_event_id = Column(GUID(), ForeignKey("scan_events.event_id"), nullable=True)
    correction_type = Column(String(20), nullable=False)  # MISSED_SCAN, WRONG_SCAN, OTHER
    proposed_time = Column(DateTime(timezone=True), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, MANAGER_APPROVED, HR_APPROVED, COMPLETED, REJECTED
    manager_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=True)
    manager_comment = Column(Text, nullable=True)
    manager_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    hr_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=True)
    hr_comment = Column(Text, nullable=True)
    hr_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_event_id = Column(GUID(), ForeignKey("scan_events.event_id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee", back_populates="correction_requests", foreign_keys=[employee_id])
    manager = relationship("Employee", foreign_keys=[manager_id])
    hr_admin = relationship("Employee", foreign_keys=[hr_id])
    original_event = relationship("ScanEvent", foreign_keys=[original_event_id])
    created_event = relationship("ScanEvent", foreign_keys=[created_event_id])
