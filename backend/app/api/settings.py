from datetime import date
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.schemas import PolicyOverrideCreate, PolicyResponse, PolicyUpdate
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.audit import AuditLog
from app.models.employee import Department, UserAccount
from app.models.policies import Policy

router = APIRouter(prefix="/api/settings", tags=["System Settings"])

ROLE_SUPER_ADMIN = "SUPER_ADMIN"
ROLE_HR_MANAGER = "HR_MANAGER"
ROLE_MANAGER = "MANAGER"

POLICY_CATALOG: Dict[str, Dict[str, Any]] = {
    "OFFICE_CAPACITY": {
        "name": "Office Capacity",
        "description": "Maximum allowed office occupancy",
        "domain": "SYSTEM",
        "default": {"max_capacity": 100},
        "manager_editable": False,
        "min_role_to_edit": ROLE_SUPER_ADMIN,
    },
    "OFFICE_TIMEZONE": {
        "name": "Office Timezone",
        "description": "Canonical timezone for attendance processing",
        "domain": "SYSTEM",
        "default": {"timezone": "Asia/Colombo"},
        "manager_editable": False,
        "min_role_to_edit": ROLE_SUPER_ADMIN,
    },
    "AUTO_CHECKOUT_TIME": {
        "name": "Auto Checkout",
        "description": "End-of-day automatic checkout cutoff",
        "domain": "SYSTEM",
        "default": {"hour": 23, "minute": 59},
        "manager_editable": False,
        "min_role_to_edit": ROLE_SUPER_ADMIN,
    },
    "SCANNER_HEARTBEAT_INTERVAL": {
        "name": "Scanner Heartbeat Interval",
        "description": "Heartbeat interval for scanner health checks (FR13.1)",
        "domain": "SYSTEM",
        "default": {"interval_sec": 60},
        "manager_editable": False,
        "min_role_to_edit": ROLE_SUPER_ADMIN,
    },
    "SCANNER_OFFLINE_MULTIPLIER": {
        "name": "Scanner Offline Threshold",
        "description": "Offline threshold multiplier against heartbeat interval (FR13.3)",
        "domain": "SYSTEM",
        "default": {"multiplier": 3},
        "manager_editable": False,
        "min_role_to_edit": ROLE_SUPER_ADMIN,
    },
    "START_TIME": {
        "name": "Office Start Time",
        "description": "Default office start time for attendance fallback",
        "domain": "WORKFORCE",
        "default": {"hour": 9, "minute": 0},
        "manager_editable": True,
        "min_role_to_edit": ROLE_HR_MANAGER,
    },
    "GRACE_PERIOD": {
        "name": "Grace Period",
        "description": "Allowed late arrival buffer after start time (FR15.1)",
        "domain": "WORKFORCE",
        "default": {"minutes": 15},
        "manager_editable": True,
        "min_role_to_edit": ROLE_HR_MANAGER,
    },
    "BREAK_DURATION": {
        "name": "Maximum Break Duration",
        "description": "Maximum on-break duration before away transition (FR2.3)",
        "domain": "WORKFORCE",
        "default": {"minutes": 30},
        "manager_editable": True,
        "min_role_to_edit": ROLE_HR_MANAGER,
    },
    "OVERTIME_THRESHOLD": {
        "name": "Overtime Threshold",
        "description": "Expected productive minutes before overtime is counted",
        "domain": "WORKFORCE",
        "default": {"threshold_min": 480},
        "manager_editable": True,
        "min_role_to_edit": ROLE_HR_MANAGER,
    },
    "HALF_DAY_RULES": {
        "name": "Half-Day Rules",
        "description": "Minimum minutes required for half-day attendance",
        "domain": "WORKFORCE",
        "default": {"min_minutes": 240},
        "manager_editable": False,
        "min_role_to_edit": ROLE_HR_MANAGER,
    },
    "CORRECTION_WINDOW": {
        "name": "Correction Request Window",
        "description": "Maximum days allowed for backdated correction requests",
        "domain": "WORKFORCE",
        "default": {"days": 7},
        "manager_editable": False,
        "min_role_to_edit": ROLE_HR_MANAGER,
    },
    "EFFICIENCY_THRESHOLD": {
        "name": "Jira Efficiency Threshold",
        "description": "Minimum productivity percentage threshold",
        "domain": "WORKFORCE",
        "default": {"threshold_percentage": 70},
        "manager_editable": False,
        "min_role_to_edit": ROLE_HR_MANAGER,
    },
}

MANAGER_EDITABLE_TYPES = {
    ptype for ptype, meta in POLICY_CATALOG.items() if meta.get("manager_editable")
}


def _normalize_policy_type(policy_type: str) -> str:
    return (policy_type or "").strip().upper()


def _get_catalog(policy_type: str) -> Dict[str, Any]:
    normalized = _normalize_policy_type(policy_type)
    catalog = POLICY_CATALOG.get(normalized)
    if not catalog:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported policy_type '{policy_type}'",
        )
    return catalog


def _validate_policy_value(policy_type: str, value: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail="Policy value must be a JSON object")

    ptype = _normalize_policy_type(policy_type)

    def require_int(key: str, min_v: int, max_v: int) -> int:
        raw = value.get(key)
        if raw is None:
            raise HTTPException(status_code=400, detail=f"Missing '{key}' in policy value")
        if not isinstance(raw, int):
            raise HTTPException(status_code=400, detail=f"'{key}' must be an integer")
        if raw < min_v or raw > max_v:
            raise HTTPException(
                status_code=400,
                detail=f"'{key}' must be between {min_v} and {max_v}",
            )
        return raw

    if ptype == "OFFICE_CAPACITY":
        require_int("max_capacity", 1, 10000)
    elif ptype == "OFFICE_TIMEZONE":
        tz = value.get("timezone")
        if not isinstance(tz, str) or not tz.strip():
            raise HTTPException(status_code=400, detail="'timezone' must be a non-empty string")
    elif ptype == "AUTO_CHECKOUT_TIME":
        require_int("hour", 0, 23)
        require_int("minute", 0, 59)
    elif ptype == "SCANNER_HEARTBEAT_INTERVAL":
        require_int("interval_sec", 10, 3600)
    elif ptype == "SCANNER_OFFLINE_MULTIPLIER":
        require_int("multiplier", 2, 10)
    elif ptype == "START_TIME":
        require_int("hour", 0, 23)
        require_int("minute", 0, 59)
    elif ptype == "GRACE_PERIOD":
        require_int("minutes", 0, 180)
    elif ptype == "BREAK_DURATION":
        require_int("minutes", 5, 240)
    elif ptype == "OVERTIME_THRESHOLD":
        require_int("threshold_min", 60, 900)
    elif ptype == "HALF_DAY_RULES":
        require_int("min_minutes", 60, 480)
    elif ptype == "CORRECTION_WINDOW":
        require_int("days", 1, 60)
    elif ptype == "EFFICIENCY_THRESHOLD":
        require_int("threshold_percentage", 1, 100)

    return value


def _scope(policy: Policy) -> str:
    return "DEPARTMENT" if policy.department_id else "GLOBAL"


async def _get_managed_department_id(db: AsyncSession, current_user: UserAccount) -> Optional[uuid.UUID]:
    if current_user.role.name != ROLE_MANAGER:
        return current_user.employee.department_id if current_user.employee else None

    dept = (
        await db.execute(
            select(Department).where(
                Department.manager_id == current_user.employee_id,
                Department.is_active == True,
            )
        )
    ).scalar_one_or_none()
    if dept:
        return dept.department_id

    # Fallback for legacy/demo data where manager assignment might not yet be linked
    # via Department.manager_id but the account is already a MANAGER in their department.
    return current_user.employee.department_id if current_user.employee else None


def _is_visible_for_role(
    role_name: str,
    policy: Policy,
    catalog: Dict[str, Any],
    managed_department_id: Optional[uuid.UUID],
) -> bool:
    if role_name == ROLE_SUPER_ADMIN:
        return True

    if role_name == ROLE_HR_MANAGER:
        return True

    if role_name == ROLE_MANAGER:
        if catalog.get("domain") != "WORKFORCE":
            return False
        if policy.department_id is None:
            return True
        return managed_department_id is not None and policy.department_id == managed_department_id

    return False


def _is_editable_for_role(
    role_name: str,
    policy: Policy,
    catalog: Dict[str, Any],
    managed_department_id: Optional[uuid.UUID],
) -> bool:
    if role_name == ROLE_SUPER_ADMIN:
        return True

    if role_name == ROLE_HR_MANAGER:
        return catalog.get("domain") == "WORKFORCE"

    if role_name == ROLE_MANAGER:
        return (
            catalog.get("domain") == "WORKFORCE"
            and policy.department_id is not None
            and managed_department_id is not None
            and policy.department_id == managed_department_id
            and policy.policy_type in MANAGER_EDITABLE_TYPES
        )

    return False


def _build_policy_response(
    policy: Policy,
    role_name: str,
    managed_department_id: Optional[uuid.UUID],
) -> PolicyResponse:
    catalog = POLICY_CATALOG.get(
        policy.policy_type,
        {
            "domain": "WORKFORCE",
            "min_role_to_edit": ROLE_SUPER_ADMIN,
            "manager_editable": False,
        },
    )

    return PolicyResponse(
        policy_id=policy.policy_id,
        name=policy.name,
        description=policy.description,
        policy_type=policy.policy_type,
        value=policy.value,
        is_active=policy.is_active,
        department_id=policy.department_id,
        department_name=policy.department.name if policy.department else None,
        scope=_scope(policy),
        domain=catalog.get("domain"),
        editable=_is_editable_for_role(role_name, policy, catalog, managed_department_id),
        min_role_to_edit=catalog.get("min_role_to_edit"),
        effective_from=policy.effective_from,
        updated_at=policy.updated_at,
    )


async def _ensure_default_global_policies(db: AsyncSession) -> None:
    existing = (
        await db.execute(select(Policy).where(Policy.department_id.is_(None)))
    ).scalars().all()
    existing_types = {p.policy_type for p in existing}

    to_create: List[Policy] = []
    for policy_type, catalog in POLICY_CATALOG.items():
        if policy_type in existing_types:
            continue
        to_create.append(
            Policy(
                name=catalog["name"],
                description=catalog["description"],
                policy_type=policy_type,
                value=catalog["default"],
                department_id=None,
                is_active=True,
            )
        )

    if to_create:
        db.add_all(to_create)
        await db.commit()


async def _log_policy_audit(
    db: AsyncSession,
    current_user: UserAccount,
    action: str,
    policy: Policy,
    old_value: Optional[Dict[str, Any]],
    new_value: Dict[str, Any],
) -> None:
    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action=action,
            entity_type="POLICY",
            entity_id=policy.policy_id,
            old_value=old_value,
            new_value=new_value,
        )
    )


@router.get("/policies", response_model=List[PolicyResponse])
async def get_policies(
    include_inactive: bool = Query(False),
    department_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """FR15: Fetch role-scoped policies with editable metadata."""
    await _ensure_default_global_policies(db)

    role_name = current_user.role.name
    managed_department_id = await _get_managed_department_id(db, current_user)

    stmt = select(Policy).options(joinedload(Policy.department))
    if not include_inactive:
        stmt = stmt.where(Policy.is_active == True)
    if department_id:
        stmt = stmt.where(Policy.department_id == department_id)

    policies = (await db.execute(stmt.order_by(Policy.policy_type, Policy.name))).scalars().all()

    visible: List[Policy] = []
    for policy in policies:
        catalog = POLICY_CATALOG.get(policy.policy_type)
        if catalog is None:
            continue
        if _is_visible_for_role(role_name, policy, catalog, managed_department_id):
            visible.append(policy)

    return [
        _build_policy_response(policy, role_name, managed_department_id)
        for policy in visible
    ]


@router.post("/policies/overrides", response_model=PolicyResponse, status_code=201)
async def create_policy_override(
    data: PolicyOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """Create or update a department-level override for a policy type."""
    role_name = current_user.role.name
    policy_type = _normalize_policy_type(data.policy_type)
    catalog = _get_catalog(policy_type)
    managed_department_id = await _get_managed_department_id(db, current_user)

    if catalog.get("domain") != "WORKFORCE":
        raise HTTPException(status_code=400, detail="Department overrides are only supported for workforce policies")

    if role_name == ROLE_SUPER_ADMIN:
        target_department_id = data.department_id
    elif role_name == ROLE_HR_MANAGER:
        target_department_id = data.department_id
    elif role_name == ROLE_MANAGER:
        if not managed_department_id:
            raise HTTPException(status_code=403, detail="Manager is not assigned to an active managed department")
        if policy_type not in MANAGER_EDITABLE_TYPES:
            raise HTTPException(status_code=403, detail="This policy type is not editable by Department Managers")
        target_department_id = managed_department_id
    else:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if target_department_id is None:
        raise HTTPException(status_code=400, detail="department_id is required for policy overrides")

    department = (
        await db.execute(select(Department).where(Department.department_id == target_department_id))
    ).scalar_one_or_none()
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")

    if role_name == ROLE_MANAGER and managed_department_id != target_department_id:
        raise HTTPException(status_code=403, detail="Department Managers can only configure their own department")

    override_value = data.value if data.value is not None else dict(catalog["default"])
    override_value = _validate_policy_value(policy_type, override_value)

    existing = (
        await db.execute(
            select(Policy)
            .options(joinedload(Policy.department))
            .where(
                Policy.policy_type == policy_type,
                Policy.department_id == target_department_id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        old_state = {
            "value": existing.value,
            "is_active": existing.is_active,
            "effective_from": existing.effective_from.isoformat() if existing.effective_from else None,
        }
        existing.value = override_value
        existing.is_active = data.is_active
        existing.effective_from = data.effective_from
        existing.name = catalog["name"]
        existing.description = catalog["description"]
        policy = existing
        audit_action = "UPDATE"
    else:
        policy = Policy(
            name=catalog["name"],
            description=catalog["description"],
            policy_type=policy_type,
            value=override_value,
            department_id=target_department_id,
            is_active=data.is_active,
            effective_from=data.effective_from,
        )
        db.add(policy)
        old_state = None
        audit_action = "CREATE"

    await db.flush()

    await _log_policy_audit(
        db=db,
        current_user=current_user,
        action=audit_action,
        policy=policy,
        old_value=old_state,
        new_value={
            "value": policy.value,
            "is_active": policy.is_active,
            "department_id": str(policy.department_id) if policy.department_id else None,
            "effective_from": policy.effective_from.isoformat() if policy.effective_from else None,
        },
    )

    await db.commit()
    await db.refresh(policy)

    policy = (
        await db.execute(
            select(Policy)
            .options(joinedload(Policy.department))
            .where(Policy.policy_id == policy.policy_id)
        )
    ).scalar_one()

    return _build_policy_response(policy, role_name, managed_department_id)


@router.put("/policies/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    policy_id: uuid.UUID,
    data: PolicyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """FR15: Role-scoped policy updates with auditability."""
    role_name = current_user.role.name
    managed_department_id = await _get_managed_department_id(db, current_user)

    policy = (
        await db.execute(
            select(Policy)
            .options(joinedload(Policy.department))
            .where(Policy.policy_id == policy_id)
        )
    ).scalar_one_or_none()

    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    catalog = _get_catalog(policy.policy_type)

    # Manager UX bridge: allow manager to edit a GLOBAL manager-editable workforce policy
    # by auto-materializing (or updating) their own department override.
    if (
        role_name == ROLE_MANAGER
        and policy.department_id is None
        and managed_department_id is not None
        and catalog.get("domain") == "WORKFORCE"
        and policy.policy_type in MANAGER_EDITABLE_TYPES
    ):
        override = (
            await db.execute(
                select(Policy)
                .options(joinedload(Policy.department))
                .where(
                    Policy.policy_type == policy.policy_type,
                    Policy.department_id == managed_department_id,
                )
            )
        ).scalar_one_or_none()

        new_value = _validate_policy_value(policy.policy_type, data.value)

        if override:
            old_state = {
                "value": override.value,
                "is_active": override.is_active,
                "effective_from": override.effective_from.isoformat() if override.effective_from else None,
            }
            override.value = new_value
            if data.is_active is not None:
                override.is_active = data.is_active
            if data.effective_from is not None:
                override.effective_from = data.effective_from
            policy_to_return = override
            audit_action = "UPDATE"
        else:
            policy_to_return = Policy(
                name=catalog["name"],
                description=catalog["description"],
                policy_type=policy.policy_type,
                value=new_value,
                department_id=managed_department_id,
                is_active=True if data.is_active is None else data.is_active,
                effective_from=data.effective_from,
            )
            db.add(policy_to_return)
            old_state = None
            audit_action = "CREATE"

        await db.flush()

        await _log_policy_audit(
            db=db,
            current_user=current_user,
            action=audit_action,
            policy=policy_to_return,
            old_value=old_state,
            new_value={
                "value": policy_to_return.value,
                "is_active": policy_to_return.is_active,
                "department_id": str(policy_to_return.department_id) if policy_to_return.department_id else None,
                "effective_from": policy_to_return.effective_from.isoformat() if policy_to_return.effective_from else None,
            },
        )

        await db.commit()
        await db.refresh(policy_to_return)

        policy_to_return = (
            await db.execute(
                select(Policy)
                .options(joinedload(Policy.department))
                .where(Policy.policy_id == policy_to_return.policy_id)
            )
        ).scalar_one()

        return _build_policy_response(policy_to_return, role_name, managed_department_id)

    if not _is_editable_for_role(role_name, policy, catalog, managed_department_id):
        if role_name == ROLE_MANAGER:
            raise HTTPException(
                status_code=403,
                detail="Department Managers can only update manager-editable policy overrides in their own department",
            )
        if role_name == ROLE_HR_MANAGER:
            raise HTTPException(
                status_code=403,
                detail="HR Managers can only update workforce policies",
            )
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    old_state = {
        "value": policy.value,
        "is_active": policy.is_active,
        "effective_from": policy.effective_from.isoformat() if policy.effective_from else None,
    }

    new_value = _validate_policy_value(policy.policy_type, data.value)
    policy.value = new_value

    if data.is_active is not None:
        policy.is_active = data.is_active

    if data.effective_from is not None:
        policy.effective_from = data.effective_from

    await db.flush()

    await _log_policy_audit(
        db=db,
        current_user=current_user,
        action="UPDATE",
        policy=policy,
        old_value=old_state,
        new_value={
            "value": policy.value,
            "is_active": policy.is_active,
            "effective_from": policy.effective_from.isoformat() if policy.effective_from else None,
        },
    )

    await db.commit()
    await db.refresh(policy)

    policy = (
        await db.execute(
            select(Policy)
            .options(joinedload(Policy.department))
            .where(Policy.policy_id == policy.policy_id)
        )
    ).scalar_one()

    return _build_policy_response(policy, role_name, managed_department_id)
