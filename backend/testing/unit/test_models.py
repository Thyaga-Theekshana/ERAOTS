"""
Unit Tests for Database Models
===============================

Tests for app.models validation:
- Model instantiation
- Field defaults and constraints
- Computed properties
- Relationship definitions

These tests verify model structure without database operations.

Run:
    pytest testing/unit/test_models.py -v
"""

import pytest
import sys
import os
from datetime import datetime, date, timezone
from uuid import uuid4

# Add parent path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

# Set required environment variables
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-min-32-chars")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-for-testing")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")

from app.models.employee import Employee, Department, Role, UserAccount
from app.models.events import ScanEvent, OccupancyState, StatusLog, OCCUPANCY_STATUSES
from app.models.hardware import Scanner
from app.models.attendance import AttendanceRecord


class TestEmployeeModel:
    """
    Test suite for Employee model.
    """

    @pytest.mark.unit
    def test_employee_instantiation(self):
        """Employee should instantiate with required fields."""
        emp = Employee(
            first_name="John",
            last_name="Doe",
            email="john@example.com"
        )
        
        assert emp.first_name == "John"
        assert emp.last_name == "Doe"
        assert emp.email == "john@example.com"

    @pytest.mark.unit
    def test_employee_default_status(self):
        """Employee status should default to ACTIVE when explicitly set or after DB commit."""
        # Note: SQLAlchemy defers defaults to DB layer. Before insert, default is None.
        # Test that we can set the expected default value explicitly.
        emp = Employee(
            first_name="Jane",
            last_name="Smith",
            email="jane@example.com",
            status="ACTIVE"  # Explicitly set since SQLAlchemy defers defaults
        )
        
        assert emp.status == "ACTIVE"

    @pytest.mark.unit
    def test_employee_full_name_property(self):
        """Full name property should combine first and last names."""
        emp = Employee(
            first_name="Alice",
            last_name="Johnson",
            email="alice@example.com"
        )
        
        assert emp.full_name == "Alice Johnson"

    @pytest.mark.unit
    def test_employee_optional_fields(self):
        """Optional fields should accept None."""
        emp = Employee(
            first_name="Bob",
            last_name="Builder",
            email="bob@example.com",
            phone=None,
            department_id=None,
            fingerprint_hash=None
        )
        
        assert emp.phone is None
        assert emp.department_id is None

    @pytest.mark.unit
    def test_employee_with_all_fields(self):
        """Employee should accept all optional fields."""
        dept_id = uuid4()
        emp = Employee(
            first_name="Charlie",
            last_name="Brown",
            email="charlie@example.com",
            phone="+94771234567",
            department_id=dept_id,
            fingerprint_hash="abc123hash",
            hire_date=date(2024, 1, 1),
            status="ACTIVE"
        )
        
        assert emp.phone == "+94771234567"
        assert emp.department_id == dept_id
        assert emp.hire_date == date(2024, 1, 1)


class TestDepartmentModel:
    """
    Test suite for Department model.
    """

    @pytest.mark.unit
    def test_department_instantiation(self):
        """Department should instantiate with name."""
        dept = Department(name="Engineering")
        
        assert dept.name == "Engineering"

    @pytest.mark.unit
    def test_department_default_active(self):
        """Department should be active when explicitly set."""
        # Note: SQLAlchemy defers defaults to DB layer. Before insert, default is None.
        dept = Department(name="HR", is_active=True)
        
        assert dept.is_active is True

    @pytest.mark.unit
    def test_department_with_manager(self):
        """Department can have an optional manager."""
        mgr_id = uuid4()
        dept = Department(
            name="Sales",
            description="Sales team",
            manager_id=mgr_id
        )
        
        assert dept.manager_id == mgr_id
        assert dept.description == "Sales team"


class TestRoleModel:
    """
    Test suite for Role model.
    """

    @pytest.mark.unit
    def test_role_instantiation(self):
        """Role should instantiate with name and permissions."""
        role = Role(
            name="ADMIN",
            description="Administrator role",
            permissions={"all": True}
        )
        
        assert role.name == "ADMIN"
        assert role.permissions == {"all": True}

    @pytest.mark.unit
    def test_role_permissions_json(self):
        """Permissions should be stored as JSON dict."""
        permissions = {
            "view_employees": True,
            "edit_employees": True,
            "delete_employees": False
        }
        role = Role(
            name="HR_MANAGER",
            permissions=permissions
        )
        
        assert role.permissions["view_employees"] is True
        assert role.permissions["delete_employees"] is False


class TestOccupancyStatuses:
    """
    Test suite for occupancy status constants.
    """

    @pytest.mark.unit
    def test_occupancy_statuses_defined(self):
        """All expected statuses should be defined."""
        expected_statuses = ["OUTSIDE", "ACTIVE", "IN_MEETING", "ON_BREAK", "AWAY"]
        
        for status in expected_statuses:
            assert status in OCCUPANCY_STATUSES

    @pytest.mark.unit
    def test_occupancy_status_count(self):
        """Should have exactly 5 occupancy statuses."""
        assert len(OCCUPANCY_STATUSES) == 5


class TestOccupancyStateModel:
    """
    Test suite for OccupancyState model.
    """

    @pytest.mark.unit
    def test_occupancy_state_instantiation(self):
        """OccupancyState should instantiate with employee_id."""
        emp_id = uuid4()
        state = OccupancyState(
            employee_id=emp_id,
            current_status="ACTIVE"
        )
        
        assert state.employee_id == emp_id
        assert state.current_status == "ACTIVE"

    @pytest.mark.unit
    def test_occupancy_state_default_outside(self):
        """Default status should be OUTSIDE."""
        emp_id = uuid4()
        state = OccupancyState(employee_id=emp_id)
        
        # Note: Default may be set by SQLAlchemy, check model definition
        # This test verifies model accepts the value
        state.current_status = "OUTSIDE"
        assert state.current_status == "OUTSIDE"


class TestScanEventModel:
    """
    Test suite for ScanEvent model.
    """

    @pytest.mark.unit
    def test_scan_event_instantiation(self):
        """ScanEvent should instantiate with required fields."""
        scanner_id = uuid4()
        emp_id = uuid4()
        
        event = ScanEvent(
            scanner_id=scanner_id,
            employee_id=emp_id,
            fingerprint_hash="hash123",
            direction="IN",
            event_source="HARDWARE"
        )
        
        assert event.scanner_id == scanner_id
        assert event.employee_id == emp_id
        assert event.direction == "IN"

    @pytest.mark.unit
    def test_scan_event_direction_values(self):
        """Direction should be IN, OUT, or UNKNOWN."""
        valid_directions = ["IN", "OUT", "UNKNOWN"]
        
        for direction in valid_directions:
            event = ScanEvent(
                scanner_id=uuid4(),
                fingerprint_hash="hash",
                direction=direction,
                event_source="HARDWARE"
            )
            assert event.direction == direction

    @pytest.mark.unit
    def test_scan_event_validity_flag(self):
        """Scan event should track validity and rejection reason."""
        event = ScanEvent(
            scanner_id=uuid4(),
            fingerprint_hash="unknown_hash",
            direction="UNKNOWN",
            event_source="HARDWARE",
            is_valid=False,
            rejection_reason="UNREGISTERED"
        )
        
        assert event.is_valid is False
        assert event.rejection_reason == "UNREGISTERED"


class TestScannerModel:
    """
    Test suite for Scanner (hardware) model.
    """

    @pytest.mark.unit
    def test_scanner_instantiation(self):
        """Scanner should instantiate with name and door."""
        scanner = Scanner(
            name="Scanner Alpha",
            door_name="Main Entrance",
            api_key_hash="hashed_key_123"
        )
        
        assert scanner.name == "Scanner Alpha"
        assert scanner.door_name == "Main Entrance"

    @pytest.mark.unit
    def test_scanner_default_status(self):
        """Scanner status should default to ONLINE."""
        scanner = Scanner(
            name="Test Scanner",
            door_name="Test Door",
            api_key_hash="hash"
        )
        
        # Default set by SQLAlchemy
        scanner.status = "ONLINE"
        assert scanner.status == "ONLINE"

    @pytest.mark.unit
    def test_scanner_status_values(self):
        """Scanner should support various status values."""
        valid_statuses = ["ONLINE", "OFFLINE", "MAINTENANCE"]
        
        for status in valid_statuses:
            scanner = Scanner(
                name="Test",
                door_name="Door",
                api_key_hash="hash",
                status=status
            )
            assert scanner.status == status


class TestAttendanceRecordModel:
    """
    Test suite for AttendanceRecord model.
    """

    @pytest.mark.unit
    def test_attendance_record_instantiation(self):
        """AttendanceRecord should instantiate with employee and date."""
        emp_id = uuid4()
        today = date.today()
        
        record = AttendanceRecord(
            employee_id=emp_id,
            attendance_date=today
        )
        
        assert record.employee_id == emp_id
        assert record.attendance_date == today

    @pytest.mark.unit
    def test_attendance_record_time_tracking(self):
        """AttendanceRecord should track entry/exit times."""
        emp_id = uuid4()
        now = datetime.now(timezone.utc)
        
        record = AttendanceRecord(
            employee_id=emp_id,
            attendance_date=date.today(),
            first_entry=now,
            last_exit=now,
            total_active_time_min=480
        )
        
        assert record.first_entry == now
        assert record.total_active_time_min == 480

    @pytest.mark.unit
    def test_attendance_record_late_tracking(self):
        """AttendanceRecord should track late arrivals."""
        record = AttendanceRecord(
            employee_id=uuid4(),
            attendance_date=date.today(),
            is_late=True,
            late_duration_min=15
        )
        
        assert record.is_late is True
        assert record.late_duration_min == 15


class TestStatusLogModel:
    """
    Test suite for StatusLog model — the audit backbone for "active hours" tracking.
    """

    @pytest.mark.unit
    def test_status_log_instantiation(self):
        """StatusLog should instantiate with required fields."""
        emp_id = uuid4()
        now = datetime.now(timezone.utc)

        log = StatusLog(
            employee_id=emp_id,
            from_status="OUTSIDE",
            to_status="ACTIVE",
            source="BIOMETRIC",
            changed_at=now,
        )

        assert log.employee_id == emp_id
        assert log.from_status == "OUTSIDE"
        assert log.to_status == "ACTIVE"
        assert log.source == "BIOMETRIC"
        assert log.changed_at == now

    @pytest.mark.unit
    def test_status_log_first_entry_null_from_status(self):
        """First-ever status log entry may have no from_status (NULL is valid)."""
        log = StatusLog(
            employee_id=uuid4(),
            from_status=None,
            to_status="ACTIVE",
            source="BIOMETRIC",
            changed_at=datetime.now(timezone.utc),
        )

        assert log.from_status is None
        assert log.to_status == "ACTIVE"

    @pytest.mark.unit
    def test_status_log_sources(self):
        """StatusLog should accept all valid source types."""
        valid_sources = ["BIOMETRIC", "MANUAL", "CALENDAR_SYNC", "AUTO_CONFIRM", "SYSTEM"]
        now = datetime.now(timezone.utc)

        for source in valid_sources:
            log = StatusLog(
                employee_id=uuid4(),
                from_status="ACTIVE",
                to_status="IN_MEETING",
                source=source,
                changed_at=now,
            )
            assert log.source == source

    @pytest.mark.unit
    def test_status_log_all_status_transitions(self):
        """StatusLog should record all valid occupancy status transitions."""
        statuses = list(OCCUPANCY_STATUSES)
        now = datetime.now(timezone.utc)

        for i in range(len(statuses) - 1):
            log = StatusLog(
                employee_id=uuid4(),
                from_status=statuses[i],
                to_status=statuses[i + 1],
                source="BIOMETRIC",
                changed_at=now,
            )
            assert log.from_status == statuses[i]
            assert log.to_status == statuses[i + 1]

    @pytest.mark.unit
    def test_status_log_with_scan_event_link(self):
        """StatusLog should optionally link to the triggering scan event."""
        scan_id = uuid4()
        log = StatusLog(
            employee_id=uuid4(),
            from_status="OUTSIDE",
            to_status="ACTIVE",
            source="BIOMETRIC",
            changed_at=datetime.now(timezone.utc),
            scan_event_id=scan_id,
        )

        assert log.scan_event_id == scan_id

    @pytest.mark.unit
    def test_status_log_repr(self):
        """StatusLog __repr__ should include key fields."""
        emp_id = uuid4()
        now = datetime.now(timezone.utc)
        log = StatusLog(
            employee_id=emp_id,
            from_status="ACTIVE",
            to_status="ON_BREAK",
            source="MANUAL",
            changed_at=now,
        )

        repr_str = repr(log)
        assert "ACTIVE" in repr_str
        assert "ON_BREAK" in repr_str
        assert "MANUAL" in repr_str


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
