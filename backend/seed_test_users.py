"""
One-shot script: seed 4 test accounts (one per role) + a test department.
Run from backend/ directory: python seed_test_users.py
"""
import asyncio
from app.core.database import AsyncSessionLocal, create_tables
from app.core.security import hash_password, hash_fingerprint
from app.models.employee import Employee, UserAccount, Role, Department
from sqlalchemy import select
import app.models  # noqa – registers all models


async def seed():
    await create_tables()

    async with AsyncSessionLocal() as db:
        # ── Fetch existing roles ────────────────────────────────────────
        result = await db.execute(select(Role))
        roles = {r.name: r for r in result.scalars().all()}

        if not roles:
            print("ERROR: No roles found. Start the server once first to seed roles, then run this script.")
            return

        # ── Ensure a test department exists ────────────────────────────
        dept_result = await db.execute(select(Department).where(Department.name == "Engineering"))
        dept = dept_result.scalar_one_or_none()
        if not dept:
            dept = Department(name="Engineering", description="Software Engineering Department")
            db.add(dept)
            await db.flush()
            print("  Created department: Engineering")

        # ── Test accounts ───────────────────────────────────────────────
        accounts = [
            {
                "first_name": "Alex",
                "last_name": "SuperAdmin",
                "email": "superadmin@eraots.com",
                "password": "super123",
                "role": "SUPER_ADMIN",
                "job_title": "System Administrator",
                "fingerprint_id": "FP-SA-001",
                "dept": None,  # SUPER_ADMIN has no department
            },
            {
                "first_name": "Sarah",
                "last_name": "HRManager",
                "email": "hr@eraots.com",
                "password": "hr1234",
                "role": "HR_MANAGER",
                "job_title": "Human Resources Manager",
                "fingerprint_id": "FP-HR-001",
                "dept": dept.department_id,
            },
            {
                "first_name": "Mike",
                "last_name": "DeptManager",
                "email": "manager@eraots.com",
                "password": "mgr123",
                "role": "MANAGER",
                "job_title": "Engineering Manager",
                "fingerprint_id": "FP-MG-001",
                "dept": dept.department_id,
            },
            {
                "first_name": "Jamie",
                "last_name": "Employee",
                "email": "employee@eraots.com",
                "password": "emp123",
                "role": "EMPLOYEE",
                "job_title": "Software Engineer",
                "fingerprint_id": "FP-EM-001",
                "dept": dept.department_id,
            },
        ]

        created = []
        for acc in accounts:
            # Skip if already exists
            exists_result = await db.execute(select(UserAccount).where(UserAccount.email == acc["email"]))
            if exists_result.scalar_one_or_none():
                print(f"  SKIP (already exists): {acc['email']}")
                continue

            emp = Employee(
                first_name=acc["first_name"],
                last_name=acc["last_name"],
                email=acc["email"],
                phone="+94771234567",
                department_id=acc["dept"],
                fingerprint_hash=hash_fingerprint(acc["fingerprint_id"]),
                job_title=acc["job_title"],
                status="ACTIVE",
            )
            db.add(emp)
            await db.flush()

            user_acc = UserAccount(
                employee_id=emp.employee_id,
                email=acc["email"],
                password_hash=hash_password(acc["password"]),
                role_id=roles[acc["role"]].role_id,
            )
            db.add(user_acc)
            created.append(acc)

        # Set Department manager to Mike DeptManager
        mgr_result = await db.execute(
            select(Employee).where(Employee.email == "manager@eraots.com")
        )
        mgr_emp = mgr_result.scalar_one_or_none()
        if mgr_emp and dept.manager_id is None:
            dept.manager_id = mgr_emp.employee_id
            print(f"  Set Mike DeptManager as Engineering department manager")

        await db.commit()

        print("\n✅ Test credentials seeded successfully!")
        print("=" * 55)
        print(f"{'Role':<15} {'Email':<30} {'Password'}")
        print("-" * 55)
        for acc in accounts:
            print(f"{acc['role']:<15} {acc['email']:<30} {acc['password']}")
        print("=" * 55)


asyncio.run(seed())
