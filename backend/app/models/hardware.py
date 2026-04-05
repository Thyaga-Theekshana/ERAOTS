"""
Scanner and scanner health log models (FR13).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, DateTime, ForeignKey, Text, Index
)
from app.core.types import GUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Scanner(Base):
    """Biometric door scanner hardware (or simulator)."""
    __tablename__ = "scanners"

    scanner_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    door_name = Column(String(100), nullable=False)
    location_description = Column(Text, nullable=True)
    api_key_hash = Column(String(64), nullable=False)
    status = Column(String(20), nullable=False, default="ONLINE")  # ONLINE, OFFLINE, DEGRADED
    heartbeat_interval_sec = Column(Integer, nullable=False, default=60)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    installed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    scan_events = relationship("ScanEvent", back_populates="scanner")
    health_logs = relationship("ScannerHealthLog", back_populates="scanner")

    def __repr__(self):
        return f"<Scanner {self.name} door={self.door_name} status={self.status}>"


class ScannerHealthLog(Base):
    """Time-series log of scanner health checks."""
    __tablename__ = "scanner_health_logs"

    log_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    scanner_id = Column(GUID(), ForeignKey("scanners.scanner_id"), nullable=False)
    status = Column(String(20), nullable=False)
    response_time_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    checked_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    scanner = relationship("Scanner", back_populates="health_logs")

    # Index
    __table_args__ = (
        Index("ix_scanner_health_scanner_time", "scanner_id", "checked_at"),
    )
