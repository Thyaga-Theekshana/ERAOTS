from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import uuid

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.employee import UserAccount
from app.models.policies import Policy
from app.api.schemas import (
    PolicyUpdate,
    PolicyResponse,
    MessageResponse
)

router = APIRouter(prefix="/api/settings", tags=["System Settings"])

@router.get("/policies", response_model=List[PolicyResponse])
async def get_policies(db: AsyncSession = Depends(get_db)):
    """FR15: Fetch all active policies (global for MVP)."""
    # Auto-seed defaults if empty for demo purposes
    result = await db.execute(select(Policy).where(Policy.is_active == True))
    policies = result.scalars().all()
    
    if not policies:
        seed1 = Policy(
            name="Office Start Time",
            policy_type="START_TIME",
            value={"hour": 9, "minute": 0}
        )
        seed2 = Policy(
            name="Daily Expected Hours",
            policy_type="OVERTIME_THRESHOLD",
            value={"threshold_min": 480}
        )
        seed3 = Policy(
            name="Jira Efficiency Threshold",
            policy_type="EFFICIENCY_THRESHOLD",
            value={"threshold_percentage": 70}
        )
        db.add_all([seed1, seed2, seed3])
        await db.commit()
        
        result = await db.execute(select(Policy).where(Policy.is_active == True))
        policies = result.scalars().all()
        
    return [
        PolicyResponse(
            policy_id=p.policy_id,
            name=p.name,
            policy_type=p.policy_type,
            value=p.value,
            is_active=p.is_active
        ) for p in policies
    ]


@router.put("/policies/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    policy_id: uuid.UUID,
    data: PolicyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """FR15: Update a specific policy parameter."""
    if current_user.role.name != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only Super Admins can alter engine policies")
        
    result = await db.execute(select(Policy).where(Policy.policy_id == policy_id))
    policy = result.scalar_one_or_none()
    
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
        
    policy.value = data.value
    await db.commit()
    
    return PolicyResponse(
        policy_id=policy.policy_id,
        name=policy.name,
        policy_type=policy.policy_type,
        value=policy.value,
        is_active=policy.is_active
    )
