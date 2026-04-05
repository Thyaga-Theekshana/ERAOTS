"""
Configurable policy model (FR15).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, ForeignKey, Text
)
from app.core.types import GUID, JSONType
from sqlalchemy.orm import relationship
from app.core.database import Base


class Policy(Base):
    """
    Flexible business rule configuration.
    Supports company-wide (department_id=NULL) and department-specific overrides.
    """
    __tablename__ = "policies"

    policy_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    policy_type = Column(String(30), nullable=False)  # GRACE_PERIOD, BREAK_DURATION, OVERTIME_THRESHOLD, HALF_DAY_RULES, CORRECTION_WINDOW
    value = Column(JSONType(), nullable=False)  # Flexible config per policy type
    department_id = Column(GUID(), ForeignKey("departments.department_id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    effective_from = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    department = relationship("Department", back_populates="policies")

    def __repr__(self):
        return f"<Policy {self.name} type={self.policy_type}>"
