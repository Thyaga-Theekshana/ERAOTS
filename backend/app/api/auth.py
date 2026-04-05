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

from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.dependencies import get_current_user
from app.models.employee import UserAccount, Employee, Role
from app.api.schemas import LoginRequest, TokenResponse, UserInfo

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


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

    return UserInfo(
        user_id=user.user_id,
        employee_id=user.employee_id,
        email=user.email,
        role=user.role.name,
        full_name=user.employee.full_name,
        department=user.employee.department.name if user.employee.department else None,
    )
