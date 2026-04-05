"""Quick test to verify DB creation and seeding."""
import asyncio
import traceback
import sys
import os

# Fix path
sys.path.insert(0, os.path.dirname(__file__))

# Disable SQLAlchemy echo for cleaner output
os.environ["DEBUG"] = "false"

async def test():
    from app.core.database import create_tables, AsyncSessionLocal
    import app.models
    
    print("[1] Creating tables...")
    await create_tables()
    print("    Tables created OK")
    
    from app.models.employee import Role, Employee, UserAccount
    from app.models.hardware import Scanner
    from app.core.security import hash_password, hash_fingerprint, generate_api_key, hash_api_key
    from sqlalchemy import select
    
    print("[2] Seeding data...")
    async with AsyncSessionLocal() as db:
        try:
            roles = {
                "SUPER_ADMIN": Role(name="SUPER_ADMIN", description="Full access", permissions={"all": True}),
                "HR_MANAGER": Role(name="HR_MANAGER", description="HR access", permissions={"hr": True}),
                "EMPLOYEE": Role(name="EMPLOYEE", description="Basic access", permissions={"basic": True}),
            }
            for r in roles.values():
                db.add(r)
            await db.flush()
            print("    3 roles created")
            
            admin = Employee(
                first_name="System", last_name="Admin", email="admin@eraots.com",
                fingerprint_hash=hash_fingerprint("ADMIN-FP-001"), status="ACTIVE",
            )
            db.add(admin)
            await db.flush()
            print(f"    Admin: {admin.employee_id}")
            
            admin_account = UserAccount(
                employee_id=admin.employee_id, email="admin@eraots.com",
                password_hash=hash_password("admin123"), role_id=roles["SUPER_ADMIN"].role_id,
            )
            db.add(admin_account)
            await db.flush()
            print("    Admin account created")
            
            scanner_ids = []
            for name, door in [("Scanner Alpha", "Main Entrance"), ("Scanner Beta", "Side Entry")]:
                key = generate_api_key()
                s = Scanner(name=name, door_name=door, api_key_hash=hash_api_key(key), status="ONLINE")
                db.add(s)
                await db.flush()
                scanner_ids.append(str(s.scanner_id))
                print(f"    {name} (ID: {s.scanner_id})")
                print(f"      API Key: {key}")
            
            await db.commit()
            print("[3] Seed complete!")
            print()
            print("=" * 50)
            print("  Scanner IDs for simulator:")
            for sid in scanner_ids:
                print(f"    {sid}")
            print("=" * 50)
            
            print("[3] Adding mock employees for simulator...")
            SAMPLE_EMPLOYEES = [
                {"name": "Alice Johnson", "fp": "FP-001"},
                {"name": "Bob Smith", "fp": "FP-002"},
                {"name": "Charlie Brown", "fp": "FP-003"},
                {"name": "Diana Prince", "fp": "FP-004"},
                {"name": "Eve Williams", "fp": "FP-005"}
            ]
            
            for emp_data in SAMPLE_EMPLOYEES:
                first, last = emp_data["name"].split(" ", 1)
                e = Employee(
                    first_name=first, last_name=last, email=f"{first.lower()}@eraots.com",
                    fingerprint_hash=hash_fingerprint(emp_data["fp"]), status="ACTIVE"
                )
                db.add(e)
            
            await db.commit()
            print("[4] Seed complete!")
            
        except Exception:
            await db.rollback()
            traceback.print_exc()

if __name__ == "__main__":
    # Delete old DB
    if os.path.exists("eraots.db"):
        os.remove("eraots.db")
        print("Old database removed")
    
    asyncio.run(test())
