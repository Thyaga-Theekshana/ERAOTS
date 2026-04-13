"""
Unit Tests for Pydantic Schemas
================================

Tests for app.api.schemas validation:
- Request schema validation (LoginRequest, EmployeeCreate, etc.)
- Response schema serialization
- Field constraints and defaults
- Optional vs required fields

These tests run in isolation without database or server dependencies.

Run:
    pytest testing/unit/test_schemas.py -v
"""

import pytest
import sys
import os
from datetime import datetime, date
from uuid import uuid4

# Add parent path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

# Set required environment variables
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-min-32-chars")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-for-testing")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")

from pydantic import ValidationError
from app.api.schemas import (
    LoginRequest,
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    DepartmentCreate,
    DepartmentUpdate,
    ScanEventRequest,
    StatusOverrideRequest,
    LeaveRequestCreate,
    LeaveRequestResponse,
    LeaveUsageSummary,
    LeaveCalendarEntry,
)


class TestLoginRequest:
    """
    Test suite for login request schema validation.
    """

    @pytest.mark.unit
    def test_valid_login_request(self):
        """Valid email and password should pass validation."""
        request = LoginRequest(email="user@example.com", password="password123")
        
        assert request.email == "user@example.com"
        assert request.password == "password123"

    @pytest.mark.unit
    def test_login_request_requires_email(self):
        """Missing email should raise validation error."""
        with pytest.raises(ValidationError) as exc_info:
            LoginRequest(password="password123")
        
        assert "email" in str(exc_info.value)

    @pytest.mark.unit
    def test_login_request_requires_password(self):
        """Missing password should raise validation error."""
        with pytest.raises(ValidationError) as exc_info:
            LoginRequest(email="user@example.com")
        
        assert "password" in str(exc_info.value)


class TestEmployeeCreate:
    """
    Test suite for employee creation schema.
    """

    @pytest.mark.unit
    def test_valid_employee_create(self):
        """All required fields should create valid schema."""
        emp = EmployeeCreate(
            first_name="John",
            last_name="Doe",
            email="john.doe@example.com",
            role_name="EMPLOYEE",
            password="securepass123"
        )
        
        assert emp.first_name == "John"
        assert emp.last_name == "Doe"
        assert emp.email == "john.doe@example.com"

    @pytest.mark.unit
    def test_employee_create_optional_fields(self):
        """Optional fields should default to None."""
        emp = EmployeeCreate(
            first_name="Jane",
            last_name="Smith",
            email="jane@example.com",
            role_name="EMPLOYEE",
            password="pass123"
        )
        
        assert emp.phone is None
        assert emp.department_id is None
        assert emp.fingerprint_id is None
        assert emp.hire_date is None

    @pytest.mark.unit
    def test_employee_create_with_optional_fields(self):
        """Optional fields should accept valid values."""
        dept_id = uuid4()
        emp = EmployeeCreate(
            first_name="Bob",
            last_name="Builder",
            email="bob@example.com",
            role_name="MANAGER",
            password="secure123",
            phone="+94771234567",
            department_id=dept_id,
            fingerprint_id="FP-BOB-001",
            hire_date=date(2024, 1, 15)
        )
        
        assert emp.phone == "+94771234567"
        assert emp.department_id == dept_id
        assert emp.fingerprint_id == "FP-BOB-001"
        assert emp.hire_date == date(2024, 1, 15)

    @pytest.mark.unit
    def test_employee_create_missing_required_fields(self):
        """Missing required fields should raise validation error."""
        with pytest.raises(ValidationError):
            EmployeeCreate(
                first_name="Incomplete"
                # Missing: last_name, email, role_name, password
            )


class TestEmployeeUpdate:
    """
    Test suite for employee update schema.
    """

    @pytest.mark.unit
    def test_employee_update_all_optional(self):
        """All fields in update should be optional."""
        # Empty update should be valid
        update = EmployeeUpdate()
        
        assert update.first_name is None
        assert update.last_name is None
        assert update.phone is None

    @pytest.mark.unit
    def test_employee_update_partial(self):
        """Partial updates should work."""
        update = EmployeeUpdate(
            phone="+94779876543",
            status="INACTIVE"
        )
        
        assert update.phone == "+94779876543"
        assert update.status == "INACTIVE"
        assert update.first_name is None


class TestEmployeeResponse:
    """
    Test suite for employee response serialization.
    """

    @pytest.mark.unit
    def test_employee_response_serialization(self):
        """Response should serialize all fields correctly."""
        emp_id = uuid4()
        now = datetime.now()
        
        response = EmployeeResponse(
            employee_id=emp_id,
            first_name="Test",
            last_name="User",
            email="test@example.com",
            phone=None,
            department_id=None,
            department_name=None,
            status="ACTIVE",
            hire_date=None,
            current_status="OUTSIDE",
            created_at=now
        )
        
        # Convert to dict to verify serialization
        data = response.model_dump()
        
        assert data["employee_id"] == emp_id
        assert data["first_name"] == "Test"
        assert data["current_status"] == "OUTSIDE"


class TestDepartmentCreate:
    """
    Test suite for department creation schema.
    """

    @pytest.mark.unit
    def test_valid_department_create(self):
        """Valid department data should pass validation."""
        dept = DepartmentCreate(
            name="Engineering",
            description="Software development team"
        )
        
        assert dept.name == "Engineering"
        assert dept.description == "Software development team"

    @pytest.mark.unit
    def test_department_create_name_required(self):
        """Department name is required."""
        with pytest.raises(ValidationError):
            DepartmentCreate(description="Missing name")

    @pytest.mark.unit
    def test_department_create_optional_manager(self):
        """Manager ID should be optional."""
        dept = DepartmentCreate(name="HR")
        assert dept.manager_id is None
        
        mgr_id = uuid4()
        dept_with_mgr = DepartmentCreate(name="Sales", manager_id=mgr_id)
        assert dept_with_mgr.manager_id == mgr_id


class TestScanEventRequest:
    """
    Test suite for scan event request schema.
    """

    @pytest.mark.unit
    def test_valid_scan_event_request(self):
        """Valid scan event should pass validation."""
        scanner_id = uuid4()
        request = ScanEventRequest(
            scanner_id=scanner_id,
            fingerprint_id="FP-001"
        )
        
        assert request.scanner_id == scanner_id
        assert request.fingerprint_id == "FP-001"
        assert request.timestamp is None  # Optional, server will set

    @pytest.mark.unit
    def test_scan_event_with_timestamp(self):
        """Scan event with explicit timestamp."""
        scanner_id = uuid4()
        ts = datetime.now()
        
        request = ScanEventRequest(
            scanner_id=scanner_id,
            fingerprint_id="FP-002",
            timestamp=ts
        )
        
        assert request.timestamp == ts


class TestStatusOverrideRequest:
    """
    Test suite for status override request schema.
    """

    @pytest.mark.unit
    def test_valid_status_override(self):
        """Valid status values should pass validation."""
        # Test various valid statuses - schema uses 'status' field
        valid_statuses = ["ACTIVE", "IN_MEETING", "ON_BREAK", "AWAY"]
        
        for status in valid_statuses:
            request = StatusOverrideRequest(status=status)
            assert request.status == status


class TestLeaveRequestCreate:
    """
    Test suite for leave request creation schema (FR8.4).
    """

    @pytest.mark.unit
    def test_valid_leave_request_create(self):
        """Valid leave request should pass validation."""
        leave_type_id = uuid4()
        req = LeaveRequestCreate(
            leave_type_id=leave_type_id,
            start_date=date(2024, 6, 1),
            end_date=date(2024, 6, 5),
            reason="Annual vacation"
        )

        assert req.leave_type_id == leave_type_id
        assert req.start_date == date(2024, 6, 1)
        assert req.end_date == date(2024, 6, 5)
        assert req.reason == "Annual vacation"

    @pytest.mark.unit
    def test_leave_request_reason_optional(self):
        """Reason field should be optional."""
        req = LeaveRequestCreate(
            leave_type_id=uuid4(),
            start_date=date(2024, 7, 1),
            end_date=date(2024, 7, 2),
        )

        assert req.reason is None

    @pytest.mark.unit
    def test_leave_request_requires_dates(self):
        """start_date and end_date are required."""
        with pytest.raises(ValidationError):
            LeaveRequestCreate(leave_type_id=uuid4())

    @pytest.mark.unit
    def test_leave_request_requires_leave_type(self):
        """leave_type_id is required."""
        with pytest.raises(ValidationError):
            LeaveRequestCreate(
                start_date=date(2024, 6, 1),
                end_date=date(2024, 6, 5),
            )


class TestLeaveUsageSummary:
    """
    Test suite for leave usage summary schema (FR8 — role-limited visibility).
    """

    @pytest.mark.unit
    def test_valid_leave_usage_summary(self):
        """LeaveUsageSummary should serialize correctly."""
        lt_id = uuid4()
        summary = LeaveUsageSummary(
            leave_type_id=lt_id,
            leave_type_name="Annual Leave",
            used_days=10,
            remaining_days=10,
            max_days_per_year=20,
            warning_level="NONE",
        )

        assert summary.leave_type_id == lt_id
        assert summary.used_days == 10
        assert summary.remaining_days == 10
        assert summary.warning_level == "NONE"

    @pytest.mark.unit
    def test_leave_usage_warning_levels(self):
        """warning_level should accept NONE, NEAR_LIMIT, EXCEEDED."""
        for level in ["NONE", "NEAR_LIMIT", "EXCEEDED"]:
            summary = LeaveUsageSummary(
                leave_type_id=uuid4(),
                leave_type_name="Sick Leave",
                used_days=5,
                warning_level=level,
            )
            assert summary.warning_level == level

    @pytest.mark.unit
    def test_leave_usage_optional_fields_default(self):
        """Optional fields should default to None / NONE."""
        summary = LeaveUsageSummary(
            leave_type_id=uuid4(),
            leave_type_name="Unpaid Leave",
            used_days=0,
        )

        assert summary.remaining_days is None
        assert summary.max_days_per_year is None
        assert summary.warning_level == "NONE"


class TestLeaveCalendarEntry:
    """
    Test suite for leave calendar entry schema.
    """

    @pytest.mark.unit
    def test_valid_leave_calendar_entry(self):
        """LeaveCalendarEntry should serialize correctly."""
        req_id = uuid4()
        emp_id = uuid4()
        entry = LeaveCalendarEntry(
            request_id=req_id,
            employee_id=emp_id,
            employee_name="John Doe",
            leave_type_name="Annual Leave",
            start_date=date(2024, 8, 1),
            end_date=date(2024, 8, 5),
            status="APPROVED",
        )

        assert entry.request_id == req_id
        assert entry.employee_id == emp_id
        assert entry.status == "APPROVED"

    @pytest.mark.unit
    def test_leave_calendar_entry_pending(self):
        """Calendar entry should support PENDING status."""
        entry = LeaveCalendarEntry(
            request_id=uuid4(),
            employee_id=uuid4(),
            start_date=date(2024, 9, 10),
            end_date=date(2024, 9, 10),
            status="PENDING",
        )

        assert entry.status == "PENDING"
        assert entry.employee_name is None
        assert entry.leave_type_name is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
