"""
ERAOTS — FastAPI Application Entry Point.
Enterprise Real-Time Attendance & Occupancy Tracking System.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.core.database import create_tables
from app.api import auth, events, employees, attendance

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("eraots")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup
    logger.info("=" * 60)
    logger.info(f"  ERAOTS v{settings.APP_VERSION} starting...")
    logger.info(f"  Debug mode: {settings.DEBUG}")
    logger.info(f"  Database: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else 'configured'}")
    logger.info("=" * 60)
    
    # Create database tables
    try:
        # Import all models so SQLAlchemy knows about them
        import app.models  # noqa: F401
        await create_tables()
        logger.info("Database tables created/verified")
        
        # Seed initial data
        await seed_initial_data()
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        logger.warning("Server starting without database — some features will be unavailable")
    
    yield
    
    # Shutdown
    logger.info("ERAOTS shutting down...")


# Create FastAPI app
app = FastAPI(
    title="ERAOTS API",
    description="Enterprise Real-Time Attendance & Occupancy Tracking System",
    version=settings.APP_VERSION,
    docs_url="/docs",      # Swagger UI
    redoc_url="/redoc",     # ReDoc
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(auth.router)
app.include_router(events.router)
app.include_router(employees.router)
app.include_router(attendance.router)


@app.get("/", tags=["Health"])
async def root():
    """Health check endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/health", tags=["Health"])
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "database": "connected",
        "office_capacity": settings.OFFICE_CAPACITY,
        "timezone": settings.OFFICE_TIMEZONE,
    }


async def seed_initial_data():
    """Seed roles, default admin, and scanners on first run."""
    from app.core.database import AsyncSessionLocal
    from app.models.employee import Role, Employee, UserAccount
    from app.models.hardware import Scanner
    from app.core.security import hash_password, hash_fingerprint, generate_api_key, hash_api_key
    from sqlalchemy import select
    
    async with AsyncSessionLocal() as db:
        # Check if roles exist
        result = await db.execute(select(Role))
        if result.first():
            logger.info("Database already seeded, skipping")
            return
        
        logger.info("Seeding initial data...")
        
        # Create roles
        roles = {
            "SUPER_ADMIN": Role(
                name="SUPER_ADMIN",
                description="Full system access - configuration, hardware, policies",
                permissions={"all": True},
            ),
            "HR_MANAGER": Role(
                name="HR_MANAGER",
                description="Reports, attendance corrections, leave management",
                permissions={
                    "view_all_attendance": True,
                    "manage_schedules": True,
                    "approve_leave": True,
                    "approve_corrections": True,
                    "generate_reports": True,
                    "activate_emergency": True,
                },
            ),
            "EMPLOYEE": Role(
                name="EMPLOYEE",
                description="View personal attendance, submit requests",
                permissions={
                    "view_own_attendance": True,
                    "submit_leave": True,
                    "submit_corrections": True,
                },
            ),
        }
        for role in roles.values():
            db.add(role)
        await db.flush()
        
        # Create default admin employee
        admin = Employee(
            first_name="System",
            last_name="Admin",
            email="admin@eraots.com",
            phone="+94770000000",
            fingerprint_hash=hash_fingerprint("ADMIN-FP-001"),
            status="ACTIVE",
        )
        db.add(admin)
        await db.flush()
        
        # Create admin user account
        admin_account = UserAccount(
            employee_id=admin.employee_id,
            email="admin@eraots.com",
            password_hash=hash_password("admin123"),
            role_id=roles["SUPER_ADMIN"].role_id,
        )
        db.add(admin_account)
        
        # Create 2 door scanners
        for i, (name, door) in enumerate([
            ("Scanner Alpha", "Main Entrance"),
            ("Scanner Beta", "Side Entry"),
        ], 1):
            api_key = generate_api_key()
            scanner = Scanner(
                name=name,
                door_name=door,
                location_description=f"Door {i} - {door}",
                api_key_hash=hash_api_key(api_key),
                status="ONLINE",
            )
            db.add(scanner)
            logger.info(f"  Scanner '{name}' created — API Key: {api_key}")
        
        await db.commit()
        logger.info("Initial data seeded successfully!")
        logger.info("  Default admin: admin@eraots.com / admin123")
