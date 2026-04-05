"""
Scan event and real-time occupancy state models.
ScanEvent is IMMUTABLE — the audit log backbone (NFR2).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Index
)
from app.core.types import GUID, JSONType
from sqlalchemy.orm import relationship
from app.core.database import Base


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
    """
    __tablename__ = "occupancy_states"

    state_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False, unique=True)
    current_status = Column(String(20), nullable=False, default="OUTSIDE")  # ACTIVE, ON_BREAK, AWAY, OUTSIDE
    last_scan_event_id = Column(GUID(), ForeignKey("scan_events.event_id"), nullable=True)
    last_state_change = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
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
