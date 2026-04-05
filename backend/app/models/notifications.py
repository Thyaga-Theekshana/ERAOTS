"""
Notification and notification preference models (FR6).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Index
)
from app.core.types import GUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Notification(Base):
    """Every notification sent, across all channels."""
    __tablename__ = "notifications"

    notification_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    recipient_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(30), nullable=False)  # LATE_ARRIVAL, UNAUTHORIZED, EMERGENCY, CORRECTION, DIGEST, etc.
    channel = Column(String(20), nullable=False)  # IN_APP, EMAIL, WHATSAPP
    priority = Column(String(10), nullable=False, default="LOW")  # LOW, MEDIUM, HIGH, CRITICAL
    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    delivery_status = Column(String(20), nullable=False, default="PENDING")  # PENDING, SENT, DELIVERED, FAILED
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    recipient = relationship("Employee", back_populates="notifications")

    # Indexes
    __table_args__ = (
        Index("ix_notifications_recipient_read", "recipient_id", "is_read"),
    )

    def __repr__(self):
        return f"<Notification {self.type} to={self.recipient_id} priority={self.priority}>"


class NotificationPreference(Base):
    """Per-employee notification opt-in/out settings."""
    __tablename__ = "notification_preferences"

    preference_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False, unique=True)
    notification_type = Column(String(30), nullable=False, default="ALL")
    in_app_enabled = Column(Boolean, default=True, nullable=False)
    email_enabled = Column(Boolean, default=True, nullable=False)
    whatsapp_enabled = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    employee = relationship("Employee", back_populates="notification_preference")
