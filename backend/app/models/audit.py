"""
Audit log model (NFR2) — tracks all administrative actions.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Index
)
from app.core.types import GUID, JSONType
from sqlalchemy.orm import relationship
from app.core.database import Base


class AuditLog(Base):
    """
    Complete audit trail of all system actions.
    Captures before/after state for any modification (NFR2.3).
    """
    __tablename__ = "audit_logs"

    audit_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("user_accounts.user_id"), nullable=True)
    action = Column(String(50), nullable=False)  # CREATE, UPDATE, DELETE, LOGIN, LOGOUT, etc.
    entity_type = Column(String(50), nullable=False)  # EMPLOYEE, SCANNER, POLICY, etc.
    entity_id = Column(GUID(), nullable=True)
    old_value = Column(JSONType(), nullable=True)
    new_value = Column(JSONType(), nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("UserAccount", back_populates="audit_logs")

    # Indexes
    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id"),
    )

    def __repr__(self):
        return f"<AuditLog {self.action} {self.entity_type} by user={self.user_id}>"
