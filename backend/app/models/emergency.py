"""
Emergency evacuation models (FR9).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer, ForeignKey, Text
)
from app.core.types import GUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class EmergencyEvent(Base):
    """Records each emergency activation with headcount snapshot."""
    __tablename__ = "emergency_events"

    emergency_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    activated_by = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    activation_time = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    deactivation_time = Column(DateTime(timezone=True), nullable=True)
    emergency_type = Column(String(30), nullable=False)  # FIRE, DRILL, SECURITY_THREAT, OTHER
    headcount_at_activation = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="ACTIVE")  # ACTIVE, RESOLVED
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    activator = relationship("Employee", foreign_keys=[activated_by])
    headcount_entries = relationship("EmergencyHeadcount", back_populates="emergency_event")

    def __repr__(self):
        return f"<EmergencyEvent {self.emergency_type} status={self.status}>"


class EmergencyHeadcount(Base):
    """Individual employee tracking during an emergency."""
    __tablename__ = "emergency_headcounts"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    emergency_id = Column(GUID(), ForeignKey("emergency_events.emergency_id"), nullable=False)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    status_at_event = Column(String(20), nullable=False)  # INSIDE, OUTSIDE, UNKNOWN
    accounted_for = Column(Boolean, default=False, nullable=False)
    last_known_door = Column(String(100), nullable=True)
    accounted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    emergency_event = relationship("EmergencyEvent", back_populates="headcount_entries")
    employee = relationship("Employee")
