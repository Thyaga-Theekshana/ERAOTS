"""
Employee & Department CRUD API (FR5: Admin Control Panel).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.security import hash_password, hash_fingerprint
from app.core.dependencies import get_current_user, require_roles
from app.models.employee import Employee, Department, Role, UserAccount
from app.models.events import OccupancyState
from app.api.schemas import (
    EmployeeCreate, EmployeeUpdate, EmployeeResponse,
    DepartmentCreate, DepartmentUpdate, DepartmentResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api", tags=["Employees & Departments"])


# ==================== EMPLOYEES ====================

@router.post("/employees", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    data: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
):
    """FR5.1: Create a new employee with user account."""
    
    # Check email uniqueness
    existing = await db.execute(
        select(Employee).where(Employee.email == data.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Get or validate role
    role_result = await db.execute(
        select(Role).where(Role.name == data.role_name.upper())
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=400, detail=f"Role '{data.role_name}' not found")
    
    # Create employee
    employee = Employee(
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        phone=data.phone,
        department_id=data.department_id,
        fingerprint_hash=hash_fingerprint(data.fingerprint_id) if data.fingerprint_id else None,
        hire_date=data.hire_date,
    )
    db.add(employee)
    await db.flush()  # Get the employee ID
    
    # Create user account
    user_account = UserAccount(
        employee_id=employee.employee_id,
        email=data.email,
        password_hash=hash_password(data.password),
        role_id=role.role_id,
    )
    db.add(user_account)
    
    # Create initial occupancy state
    occ_state = OccupancyState(
        employee_id=employee.employee_id,
        current_status="OUTSIDE",
    )
    db.add(occ_state)
    
    return EmployeeResponse(
        employee_id=employee.employee_id,
        first_name=employee.first_name,
        last_name=employee.last_name,
        email=employee.email,
        phone=employee.phone,
        department_id=employee.department_id,
        status=employee.status,
        hire_date=employee.hire_date,
        current_status="OUTSIDE",
        created_at=employee.created_at,
    )


@router.get("/employees", response_model=List[EmployeeResponse])
async def list_employees(
    department_id: UUID = None,
    status_filter: str = None,
    search: str = None,
    db: AsyncSession = Depends(get_db),
):
    """FR5.1: List all employees with optional filters."""
    query = select(Employee).options(selectinload(Employee.department))
    
    if department_id:
        query = query.where(Employee.department_id == department_id)
    if status_filter:
        query = query.where(Employee.status == status_filter.upper())
    if search:
        search_term = f"%{search}%"
        query = query.where(
            (Employee.first_name.ilike(search_term)) |
            (Employee.last_name.ilike(search_term)) |
            (Employee.email.ilike(search_term))
        )
    
    query = query.order_by(Employee.first_name)
    result = await db.execute(query)
    employees = result.scalars().all()
    
    responses = []
    for emp in employees:
        # Get occupancy state
        occ_result = await db.execute(
            select(OccupancyState).where(OccupancyState.employee_id == emp.employee_id)
        )
        occ = occ_result.scalar_one_or_none()
        
        responses.append(EmployeeResponse(
            employee_id=emp.employee_id,
            first_name=emp.first_name,
            last_name=emp.last_name,
            email=emp.email,
            phone=emp.phone,
            department_id=emp.department_id,
            department_name=emp.department.name if emp.department else None,
            status=emp.status,
            hire_date=emp.hire_date,
            current_status=occ.current_status if occ else "OUTSIDE",
            created_at=emp.created_at,
        ))
    
    return responses


@router.get("/employees/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a single employee by ID."""
    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.department))
        .where(Employee.employee_id == employee_id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    occ_result = await db.execute(
        select(OccupancyState).where(OccupancyState.employee_id == emp.employee_id)
    )
    occ = occ_result.scalar_one_or_none()
    
    return EmployeeResponse(
        employee_id=emp.employee_id,
        first_name=emp.first_name,
        last_name=emp.last_name,
        email=emp.email,
        phone=emp.phone,
        department_id=emp.department_id,
        department_name=emp.department.name if emp.department else None,
        status=emp.status,
        hire_date=emp.hire_date,
        current_status=occ.current_status if occ else "OUTSIDE",
        created_at=emp.created_at,
    )


@router.put("/employees/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
):
    """FR5.1: Update an employee profile."""
    result = await db.execute(
        select(Employee).where(Employee.employee_id == employee_id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    if data.first_name is not None:
        emp.first_name = data.first_name
    if data.last_name is not None:
        emp.last_name = data.last_name
    if data.phone is not None:
        emp.phone = data.phone
    if data.department_id is not None:
        emp.department_id = data.department_id
    if data.fingerprint_id is not None:
        emp.fingerprint_hash = hash_fingerprint(data.fingerprint_id)
    if data.status is not None:
        emp.status = data.status.upper()
    
    occ_result = await db.execute(
        select(OccupancyState).where(OccupancyState.employee_id == emp.employee_id)
    )
    occ = occ_result.scalar_one_or_none()
    
    return EmployeeResponse(
        employee_id=emp.employee_id,
        first_name=emp.first_name,
        last_name=emp.last_name,
        email=emp.email,
        phone=emp.phone,
        department_id=emp.department_id,
        status=emp.status,
        hire_date=emp.hire_date,
        current_status=occ.current_status if occ else "OUTSIDE",
        created_at=emp.created_at,
    )


# ==================== DEPARTMENTS ====================

@router.post("/departments", response_model=DepartmentResponse, status_code=201)
async def create_department(
    data: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
):
    """FR5.2: Create a new department."""
    existing = await db.execute(
        select(Department).where(Department.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Department name already exists")
    
    dept = Department(
        name=data.name,
        description=data.description,
        manager_id=data.manager_id,
    )
    db.add(dept)
    await db.flush()
    
    return DepartmentResponse(
        department_id=dept.department_id,
        name=dept.name,
        description=dept.description,
        manager_id=dept.manager_id,
        is_active=dept.is_active,
        employee_count=0,
        created_at=dept.created_at,
    )


@router.get("/departments", response_model=List[DepartmentResponse])
async def list_departments(db: AsyncSession = Depends(get_db)):
    """FR5.2: List all departments with employee counts."""
    result = await db.execute(
        select(Department).order_by(Department.name)
    )
    departments = result.scalars().all()
    
    responses = []
    for dept in departments:
        count_result = await db.execute(
            select(func.count(Employee.employee_id)).where(Employee.department_id == dept.department_id)
        )
        count = count_result.scalar()
        
        responses.append(DepartmentResponse(
            department_id=dept.department_id,
            name=dept.name,
            description=dept.description,
            manager_id=dept.manager_id,
            is_active=dept.is_active,
            employee_count=count,
            created_at=dept.created_at,
        ))
    
    return responses


@router.put("/departments/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: UUID,
    data: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
):
    """FR5.2: Update a department."""
    result = await db.execute(
        select(Department).where(Department.department_id == department_id)
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    if data.name is not None:
        dept.name = data.name
    if data.description is not None:
        dept.description = data.description
    if data.manager_id is not None:
        dept.manager_id = data.manager_id
    if data.is_active is not None:
        dept.is_active = data.is_active
    
    count_result = await db.execute(
        select(func.count(Employee.employee_id)).where(Employee.department_id == dept.department_id)
    )
    count = count_result.scalar()
    
    return DepartmentResponse(
        department_id=dept.department_id,
        name=dept.name,
        description=dept.description,
        manager_id=dept.manager_id,
        is_active=dept.is_active,
        employee_count=count,
        created_at=dept.created_at,
    )
