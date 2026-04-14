import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID as pgUUID

# We fallback to core types if postgres not used
from sqlalchemy.types import TypeDecorator, CHAR

class GUID(TypeDecorator):
    impl = CHAR
    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(pgUUID())
        else:
            return dialect.type_descriptor(CHAR(32))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                return "%.32x" % uuid.UUID(value).int
            else:
                return "%.32x" % value.int

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                value = uuid.UUID(value)
            return value

from app.core.database import Base

class DailyProductivityLog(Base):
    """
    Stores daily efficiency summaries derived from Jira activity vs physical desk presence.
    """
    __tablename__ = "daily_productivity_logs"

    log_id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    employee_id = Column(GUID(), ForeignKey("employees.employee_id"), nullable=False)
    
    # Store the exact date string like '2026-04-14'
    log_date = Column(String(10), nullable=False)
    
    # Raw stats
    tickets_resolved_count = Column(Integer, default=0)
    jira_time_logged_minutes = Column(Integer, default=0)    
    eraots_active_minutes = Column(Integer, default=0)
    
    # Efficiency ratio (%)
    efficiency_percentage = Column(Float, default=0.0)
    
    last_synced_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    employee = relationship("Employee")

    def __repr__(self):
        return f"<DailyProductivityLog employee={self.employee_id} date={self.log_date} eff={self.efficiency_percentage}%>"
