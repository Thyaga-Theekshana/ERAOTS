"""
Authentication API endpoints.
Handles login, token generation, and user info.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import verify_password, create_access_token, hash_password
from app.core.dependencies import get_current_user
from app.models.employee import UserAccount, Employee, Role, Department
from app.api.schemas import LoginRequest, TokenResponse, UserInfo

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class ProfileUpdate(BaseModel):
    """Schema for profile updates."""
    phone: Optional[str] = None
    profile_image_url: Optional[str] = None
    job_title: Optional[str] = None  # Free-text, updateable for promotions


class PasswordChange(BaseModel):
    """Schema for password change."""
    current_password: str
    new_password: str


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticate user and return JWT access token.
    Uses OAuth2 password flow (email + password).
    """
    # Find user by email
    result = await db.execute(
        select(UserAccount)
        .options(selectinload(UserAccount.employee), selectinload(UserAccount.role))
        .where(UserAccount.email == form_data.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    # Create JWT token
    token = create_access_token(
        data={
            "sub": str(user.user_id),
            "role": user.role.name,
            "employee_id": str(user.employee_id),
        }
    )

    # Update last login
    user.last_login = datetime.now(timezone.utc)

    return TokenResponse(
        access_token=token,
        user_id=user.user_id,
        role=user.role.name,
        employee_name=user.employee.full_name,
    )


@router.get("/me", response_model=UserInfo)
async def get_me(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the currently authenticated user's profile."""
    result = await db.execute(
        select(UserAccount)
        .options(
            selectinload(UserAccount.employee).selectinload(Employee.department),
            selectinload(UserAccount.role),
        )
        .where(UserAccount.user_id == current_user.user_id)
    )
    user = result.scalar_one()
    
    # Check if this employee is a manager of any department
    managed_dept_result = await db.execute(
        select(Department).where(Department.manager_id == user.employee_id)
    )
    managed_dept = managed_dept_result.scalar_one_or_none()

    return UserInfo(
        user_id=user.user_id,
        employee_id=user.employee_id,
        email=user.email,
        role=user.role.name,
        full_name=user.employee.full_name,
        department=user.employee.department.name if user.employee.department else None,
        department_id=user.employee.department_id,
        is_manager=managed_dept is not None,
        managed_department_id=managed_dept.department_id if managed_dept else None,
        managed_department_name=managed_dept.name if managed_dept else None,
        phone=user.employee.phone,
        profile_image_url=user.employee.profile_image_url,
        job_title=user.employee.job_title,
        permissions=user.role.permissions or {},
    )


@router.put("/me/profile", response_model=UserInfo)
async def update_profile(
    updates: ProfileUpdate,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's profile (phone, profile image)."""
    result = await db.execute(
        select(UserAccount)
        .options(
            selectinload(UserAccount.employee).selectinload(Employee.department),
            selectinload(UserAccount.role),
        )
        .where(UserAccount.user_id == current_user.user_id)
    )
    user = result.scalar_one()
    
    # Update employee fields
    if updates.phone is not None:
        user.employee.phone = updates.phone
    if updates.profile_image_url is not None:
        user.employee.profile_image_url = updates.profile_image_url
    if updates.job_title is not None:
        user.employee.job_title = updates.job_title
    
    await db.commit()
    await db.refresh(user)
    
    # Check if this employee is a manager of any department
    managed_dept_result = await db.execute(
        select(Department).where(Department.manager_id == user.employee_id)
    )
    managed_dept = managed_dept_result.scalar_one_or_none()
    
    return UserInfo(
        user_id=user.user_id,
        employee_id=user.employee_id,
        email=user.email,
        role=user.role.name,
        full_name=user.employee.full_name,
        department=user.employee.department.name if user.employee.department else None,
        department_id=user.employee.department_id,
        is_manager=managed_dept is not None,
        managed_department_id=managed_dept.department_id if managed_dept else None,
        managed_department_name=managed_dept.name if managed_dept else None,
        phone=user.employee.phone,
        profile_image_url=user.employee.profile_image_url,
        job_title=user.employee.job_title,
        permissions=user.role.permissions or {},
    )


@router.put("/me/password")
async def change_password(
    data: PasswordChange,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change current user's password."""
    result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == current_user.user_id)
    )
    user = result.scalar_one()
    
    # Verify current password
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    
    # Update password
    user.password_hash = hash_password(data.new_password)
    await db.commit()
    
    return {"message": "Password updated successfully"}
