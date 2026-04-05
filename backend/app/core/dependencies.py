"""
FastAPI dependency injection functions.
Provides database sessions, current user, role checks, etc.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import decode_access_token
from typing import List


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Dependency: Extract and validate the current user from JWT token.
    Returns the UserAccount model instance.
    """
    from app.models.employee import UserAccount

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == user_id)
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user=Depends(get_current_user),
):
    """Dependency: Ensure the current user is active."""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def require_roles(allowed_roles: List[str]):
    """
    Dependency factory: Require the current user to have one of the specified roles.
    
    Usage:
        @router.get("/admin", dependencies=[Depends(require_roles(["SUPER_ADMIN"]))])
    """
    async def role_checker(
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        from app.models.employee import Role
        
        result = await db.execute(
            select(Role).where(Role.role_id == current_user.role_id)
        )
        role = result.scalar_one_or_none()

        if role is None or role.name not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {allowed_roles}",
            )
        return current_user

    return role_checker
