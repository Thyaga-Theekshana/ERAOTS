# ERAOTS Codebase Analysis — Full System Understanding

> Enterprise Real-Time Attendance & Occupancy Tracking System

---

## 1. Architecture Overview

```mermaid
graph TB
    subgraph Frontend["Frontend (React 19 + Vite)"]
        APP["App.jsx — Router + Auth"]
        PAGES["18 Page Components"]
        API_SVC["api.js — Axios Client"]
        CTX["AuthContext + ThemeContext"]
        LAYOUT["AppLayout — Glassmorphic Shell"]
    end

    subgraph Backend["Backend (FastAPI + SQLAlchemy Async)"]
        MAIN["main.py — Lifespan + CORS + Routers"]
        subgraph API_LAYER["API Layer (11 Routers)"]
            AUTH["auth.py"]
            EVENTS["events.py (1395 lines — largest)"]
            EMPLOYEES["employees.py"]
            ATTENDANCE["attendance.py"]
            SCHEDULES["schedules.py"]
            CORRECTIONS["corrections.py"]
            NOTIFICATIONS["notifications.py"]
            EMERGENCY["emergency.py"]
            SCANNERS["scanners.py"]
            SETTINGS["settings.py"]
            REPORTS["reports.py"]
        end
        subgraph CORE["Core Layer"]
            CONFIG["config.py — Pydantic Settings"]
            DB["database.py — Async Engine"]
            SECURITY["security.py — JWT + Bcrypt"]
            DEPS["dependencies.py — DI"]
            ATT_PROC["attendance_processor.py"]
            NOTIF_ENGINE["notifications.py — Dispatch"]
            TYPES["types.py — GUID + JSONType"]
        end
        subgraph MODELS["Data Models (11 modules, 20+ entities)"]
            M_EMP["employee.py — Employee, Department, Role, UserAccount"]
            M_EVT["events.py — ScanEvent, OccupancyState, PendingStateTransition, StatusLog, CalendarSettings, SpecialMeeting"]
            M_ATT["attendance.py — AttendanceRecord"]
            M_SCH["schedule.py — Schedule, LeaveType, LeaveRequest, Holiday"]
            M_NOT["notifications.py — Notification, NotificationPreference"]
            M_COR["corrections.py — CorrectionRequest"]
            M_POL["policies.py — Policy"]
            M_EMG["emergency.py — EmergencyEvent, EmergencyHeadcount"]
            M_HW["hardware.py — Scanner, ScannerHealthLog"]
            M_AUD["audit.py — AuditLog"]
        end
        SCHEMAS["schemas.py — 30+ Pydantic models"]
    end

    subgraph Data["Data Layer"]
        SQLITE["SQLite (Dev) — eraots.db"]
        PG["PostgreSQL 15 (Prod — not active)"]
        REDIS["Redis 7 (Optional — not connected)"]
    end

    Frontend -->|HTTP + WS| Backend
    Backend --> Data
```

---

## 2. Tech Stack Summary

| Layer | Technology | Status |
|-------|-----------|--------|
| **Backend Framework** | FastAPI 0.115.0 | ✅ Working |
| **ORM** | SQLAlchemy 2.0.35 (async) | ✅ Working |
| **Dev Database** | SQLite (aiosqlite) | ✅ Active |
| **Prod Database** | PostgreSQL (asyncpg) | ⚠️ Configured in .env but not active |
| **Auth** | JWT via python-jose + bcrypt | ✅ Working |
| **Frontend** | React 19 + Vite 8 | ✅ Working |
| **UI Library** | Lucide-react icons + Recharts | ✅ Working |
| **Routing** | react-router-dom v7 | ✅ Working |
| **API Client** | Axios | ✅ Working |
| **Real-time** | WebSocket (native) | ✅ Implemented |
| **Design System** | Vigilant Glass (custom CSS) | ✅ Implemented |
| **Redis** | redis 5.1 + celery 5.4 | ❌ Not connected/used |
| **Alembic** | alembic 1.13.2 | ❌ Not configured (uses `create_all`) |
| **Export** | openpyxl + reportlab | ✅ Available |

---

## 3. Database Schema — All Tables

```mermaid
erDiagram
    departments ||--o{ employees : "has"
    departments ||--o{ schedules : "has"
    departments ||--o{ policies : "has"
    employees ||--o| user_accounts : "has"
    employees ||--o{ scan_events : "generates"
    employees ||--o| occupancy_states : "tracks"
    employees ||--o{ attendance_records : "daily"
    employees ||--o{ leave_requests : "submits"
    employees ||--o{ notifications : "receives"
    employees ||--o{ correction_requests : "submits"
    employees ||--o{ status_logs : "audit"
    roles ||--o{ user_accounts : "assigned"
    scanners ||--o{ scan_events : "produces"
    scanners ||--o{ scanner_health_logs : "health"
    leave_types ||--o{ leave_requests : "categorizes"
    emergency_events ||--o{ emergency_headcounts : "tracks"
    user_accounts ||--o{ audit_logs : "actions"
    notifications ||--o{ pending_state_transitions : "linked"
```

**Total: 21 tables** — `departments`, `employees`, `roles`, `user_accounts`, `scan_events`, `occupancy_states`, `pending_state_transitions`, `status_logs`, `employee_calendar_settings`, `employee_timezone_preferences`, `special_meetings`, `attendance_records`, `schedules`, `employee_schedules`, `leave_types`, `leave_requests`, `holidays`, `notifications`, `notification_preferences`, `correction_requests`, `policies`, `emergency_events`, `emergency_headcounts`, `scanners`, `scanner_health_logs`, `audit_logs`

---

## 4. API Endpoints — Complete Map

### Auth (`/api/auth`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/login` | OAuth2 password login → JWT | ❌ |
| GET | `/me` | Current user profile | ✅ |
| PUT | `/me/profile` | Update phone/image | ✅ |
| PUT | `/me/password` | Change password | ✅ |

### Events & Occupancy (`/api/events`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/scan` | Receive biometric scan (FR1) | ❌ (should use API key) |
| GET | `/recent` | Recent valid events feed (FR3) | ❌ |
| GET | `/occupancy` | Live occupancy overview (FR2) | ❌ |
| GET | `/occupancy/employees` | Per-employee status | ❌ |
| GET | `/status-timeline/{id}` | Daily status breakdown (FR4) | ✅ |
| WS | `/ws/dashboard` | Real-time push updates (FR3.3) | ❌ |
| GET | `/pending-transitions` | Pending 30-sec confirmations | ✅ |
| PUT | `/pending-transitions/{id}/action` | Confirm/Cancel transition | ✅ |
| PUT | `/pending-transitions/{id}/reject` | Shortcut to cancel | ✅ |
| PUT | `/status-override` | Manual portal toggle | ✅ |
| POST | `/trigger-meeting-transition` | Calendar sync trigger | ❌ (internal) |
| GET | `/calendar-settings` | Get employee calendar settings | ✅ |
| PUT | `/calendar-settings` | Update calendar settings | ✅ |
| GET | `/special-meetings` | List special meetings | ✅ (Admin/HR/Manager) |
| POST | `/special-meetings` | Create special meeting | ✅ (Admin/HR/Manager) |
| POST | `/special-meetings/{id}/trigger` | Trigger special meeting | ✅ (Admin/HR/Manager) |

### Employees (`/api/employees`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/` | Create employee + user account | ✅ (HR/Admin) |
| GET | `/` | List employees (with filters) | ✅ |
| GET | `/{id}` | Get specific employee | ✅ |
| PUT | `/{id}` | Update employee | ✅ (HR/Admin) |

### Departments (`/api/departments`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/` | Create department | ✅ (HR/Admin) |
| GET | `/` | List departments | ✅ |
| PUT | `/{id}` | Update department | ✅ (HR/Admin) |

### Attendance (`/api/attendance`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/process` | Process daily attendance records | ✅ (Admin) |
| GET | `/` | List attendance records | ✅ |

### Schedules & Leave (`/api/schedules`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/` | List schedules | ✅ |
| POST | `/` | Create schedule | ✅ (HR/Admin) |
| PUT | `/{id}` | Update schedule | ✅ (HR/Admin) |
| GET | `/my-schedule` | Employee's own schedule | ✅ |
| GET | `/leave-types` | List leave types | ✅ |
| POST | `/leave-types` | Create leave type | ✅ (HR/Admin) |
| POST | `/leave-requests` | Submit leave request | ✅ |
| GET | `/leave-requests` | List leave requests | ✅ |
| GET | `/leave-requests/my` | Employee's own requests | ✅ |
| PUT | `/leave-requests/{id}/status` | Approve/reject leave | ✅ (HR/Admin) |
| GET | `/leave-usage` | Leave balance/usage | ✅ |
| GET | `/leave-calendar` | Leave calendar view | ✅ |

### Corrections (`/api/corrections`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/` | Submit correction request | ✅ |
| GET | `/` | List corrections | ✅ |
| PUT | `/{id}/status` | Approve/reject correction | ✅ (HR/Admin) |

### Notifications (`/api/notifications`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/` | List notifications | ✅ |
| PUT | `/{id}/read` | Mark as read | ✅ |

### Emergency (`/api/emergency`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/trigger` | Activate emergency | ✅ (HR/Admin) |
| GET | `/active` | Get active emergency | ✅ |
| GET | `/` | Emergency history | ✅ |
| PUT | `/{id}/resolve` | Resolve emergency | ✅ (HR/Admin) |
| PUT | `/headcount/{id}/account` | Mark employee accounted | ✅ |

### Scanners (`/api/scanners`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/` | Register scanner | ✅ (HR/Admin) |
| GET | `/` | List scanners | ✅ (HR/Admin) |

### Settings (`/api/settings`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/policies` | List active policies | ✅ |
| PUT | `/policies/{id}` | Update policy value | ✅ (Admin) |

### Reports (`/api/reports`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/attendance` | Export attendance (CSV/Excel/PDF) | ✅ |
| GET | `/employees` | Export employee directory | ✅ |
| GET | `/late-arrivals` | Export late arrivals | ✅ |
| GET | `/department-summary` | Export department summary | ✅ |

---

## 5. Frontend Pages — Component Map

| Page | File | Role Access | Key Features |
|------|------|-------------|--------------|
| **Login** | `LoginPage.jsx` | Public | Email/password, redirect on auth |
| **Dashboard** | `DashboardPage.jsx` | All | Live occupancy, event feed, WebSocket, charts |
| **Employees** | `EmployeesPage.jsx` | HR/Admin | CRUD, role assignment, search/filter |
| **Departments** | `DepartmentsPage.jsx` | HR/Admin | CRUD, manager assignment |
| **Attendance** | `AttendancePage.jsx` | HR/Admin | Records table, date filters, process trigger |
| **Schedules** | `SchedulesPage.jsx` | HR/Admin | Schedule + leave management |
| **Corrections** | `CorrectionsPage.jsx` | All | Submit/review corrections |
| **Notifications** | `NotificationsPage.jsx` | All | Notification bell view |
| **Emergency** | `EmergencyPage.jsx` | HR/Admin | Emergency trigger + headcount |
| **Scanners** | `ScannersPage.jsx` | HR/Admin | Scanner registration/monitoring |
| **Analytics** | `AnalyticsPage.jsx` | HR/Admin | Charts and trends |
| **Settings** | `SettingsPage.jsx` | HR/Admin | Policy configuration |
| **Profile** | `ProfilePage.jsx` | All | Personal profile, password change |
| **My Attendance** | `MyAttendancePage.jsx` | All | Personal attendance view |
| **My Schedule** | `MySchedulePage.jsx` | All | Personal schedule + leave |
| **Team** | `TeamPage.jsx` | Manager | Department team view |
| **Dev Tools** | `DevToolsPage.jsx` | Super Admin | Simulator, testing tools |

---

## 6. Core Business Logic — Key Implementation Details

### 6.1 Hybrid Status Tracking System
The heart of the system. Employees have 5 possible statuses:
- `OUTSIDE` — Not in the building
- `ACTIVE` — Inside and at desk
- `IN_MEETING` — Inside but in a meeting
- `ON_BREAK` — On a break  
- `AWAY` — Away for extended period

**Hierarchy of Truth** (priority order):
1. **Biometric Scan OUT** → Forces `OUTSIDE`, aborts all pending transitions
2. **Manual Portal Toggle** → Direct user override (`ACTIVE` ↔ `IN_MEETING`)
3. **Calendar Sync** → 30-second confirmation rule via `PendingStateTransition`

### 6.2 The 30-Second Rule
When a calendar meeting starts:
1. System creates `PendingStateTransition` (status=`PENDING`)
2. Actionable `Notification` sent with `[Cancel]` / `[Confirm Now]` buttons
3. After 30 seconds: auto-confirm → employee becomes `IN_MEETING`
4. Biometric OUT scan at any point → abort the transition

### 6.3 StatusLog — The Audit Backbone
Every status change is logged immutably to `status_logs` table via `log_status_change()` function in [events.py](file:///c:/UOM/L1S2/Industry%20Reconnaisance/ERAOTS-1/backend/app/api/events.py#L67-L93). This is the primary source for calculating accurate working hours, meeting time, and break time.

### 6.4 Attendance Processor
[attendance_processor.py](file:///c:/UOM/L1S2/Industry%20Reconnaisance/ERAOTS-1/backend/app/core/attendance_processor.py) transforms raw scan events + StatusLog into daily `AttendanceRecord`:
- **Primary source:** `StatusLog` entries (minute-level audit trail)
- **Fallback:** Raw `ScanEvent` pairs (legacy data)
- Calculates: `total_active_time`, `total_meeting_time`, `total_productive_time`, `break_count`, `is_late`, `overtime`

### 6.5 GUID & JSON Type Compatibility
The system uses custom SQLAlchemy type decorators ([types.py](file:///c:/UOM/L1S2/Industry%20Reconnaisance/ERAOTS-1/backend/app/core/types.py)) to provide cross-database compatibility:
- `GUID` → PostgreSQL `UUID` / SQLite `CHAR(36)`
- `JSONType` → PostgreSQL `JSONB` / SQLite `TEXT` with JSON serialization

### 6.6 Role-Based Access Control (RBAC)
4 roles with JSON-based permissions stored in `roles.permissions`:
- `SUPER_ADMIN` — Full access + dev tools + system logs
- `HR_MANAGER` — Reports, corrections, leave management, employees, scanners
- `MANAGER` — Department-scoped access
- `EMPLOYEE` — Personal data only

---

## 7. Known Bugs & Errors

> [!CAUTION]
> **These are critical bugs found in log files that need fixing before further development.**

### Bug #1: `dispatch_notification()` uses wrong field name
**File:** [core/notifications.py](file:///c:/UOM/L1S2/Industry%20Reconnaisance/ERAOTS-1/backend/app/core/notifications.py#L23-L29)
**Error:** `TypeError: 'user_id' is an invalid keyword argument for Notification`
**Root Cause:** The `Notification` model uses `recipient_id` (not `user_id`), but `dispatch_notification()` passes `user_id=user_id`.
**Also:** Missing required fields `type`, `channel`, `priority`, `delivery_status`.
```diff
-    new_notif = Notification(
-        user_id=user_id,
-        title=title,
-        message=message,
-        notification_type=notification_type,
-        is_read=False
-    )
+    new_notif = Notification(
+        recipient_id=user_id,
+        title=title,
+        message=message,
+        type=notification_type,
+        channel="IN_APP",
+        priority="MEDIUM",
+        delivery_status="DELIVERED",
+        is_read=False,
+    )
```
**Impact:** Breaks leave approval notifications and correction approval notifications.

---

### Bug #2: Scanner registration doesn't set `api_key_hash`
**File:** [api/scanners.py](file:///c:/UOM/L1S2/Industry%20Reconnaisance/ERAOTS-1/backend/app/api/scanners.py#L32-L40)
**Error:** `IntegrityError: NOT NULL constraint failed: scanners.api_key_hash`
**Root Cause:** The `register_scanner` endpoint generates an API key but never hashes and stores it on the `Scanner` object. Field `api_key_hash` is `nullable=False` in the model.
```diff
     scanner = Scanner(
         name=data.name,
         door_name=data.door_name,
         location_description=data.location_description,
         heartbeat_interval_sec=data.heartbeat_interval_sec,
+        api_key_hash=hashlib.sha256(api_key.encode()).hexdigest(),
         status="OFFLINE"
     )
```
**Impact:** Cannot register new scanners — 500 error on POST `/api/scanners/`.

---

### Bug #3: Correction approval creates ScanEvent with `scanner_id=None`
**File:** [api/corrections.py](file:///c:/UOM/L1S2/Industry%20Reconnaisance/ERAOTS-1/backend/app/api/corrections.py#L134-L141)
**Error:** `IntegrityError: NOT NULL constraint failed: scan_events.scanner_id`
**Root Cause:** The `ScanEvent` model has `scanner_id` as `nullable=False`, but approved corrections set `scanner_id=None`.
```python
synthetic_event = ScanEvent(
    employee_id=req.employee_id,
    scanner_id=None,  # ← This violates NOT NULL constraint
    fingerprint_hash="MANUAL_CORRECTION",
    ...
)
```
**Fix options:**
1. Make `scanner_id` nullable in the `ScanEvent` model (requires migration)
2. Create a "virtual" scanner for manual corrections and reference its ID

**Impact:** Cannot approve MISSED_SCAN correction requests — 500 error.

---

### Bug #4: `ScanEventResponse` validation fails for unauthorized scans
**File:** [error.txt](file:///c:/UOM/L1S2/Industry%20Reconnaisance/ERAOTS-1/backend/error.txt)
**Error:** `ValidationError: UUID input should be a string, bytes or UUID object [input_value=None]`
**Root Cause:** When an unauthorized scan is processed, `event.event_id` is `None` at the time `ScanEventResponse` is constructed (before `flush()` assigns the UUID). The `event_id` column uses `default=uuid.uuid4` which only applies on `flush()`.
**Note:** This may already be fixed since `flush()` is called before the response now.

---

### Bug #5: Emergency headcount query uses wrong status values
**File:** uvicorn_err.log line 820
**Detail:** Query filters for `INSIDE` and `ON_BREAK` but the `OccupancyState` model uses `ACTIVE`, `IN_MEETING`, `ON_BREAK`, `AWAY`, `OUTSIDE`.
**Impact:** Emergency headcount may miss employees who are `ACTIVE` or `IN_MEETING`.

---

### Bug #6: `OccupancyState` missing `last_change_source` column in older queries
**File:** uvicorn_err.log line 817
**Detail:** The SQL query `SELECT occupancy_states...` doesn't include `last_change_source` column, suggesting the DB schema might be out of date if the DB was created before this column was added. Since `create_all` doesn't alter existing tables, any schema additions after initial creation won't apply without dropping and recreating the table.

---

## 8. Architectural Concerns & Tech Debt

### 8.1 No Database Migrations
> [!WARNING]
> **Alembic is listed as a dependency but never configured.** The system relies on `create_all()` which ONLY creates tables that don't exist — it cannot ALTER existing tables. Any model changes after initial creation will silently fail to apply.

**Recommendation:** Set up Alembic migrations before any schema changes.

### 8.2 N+1 Query Problem in `/recent` and `/occupancy/employees`
[events.py L313-L351](file:///c:/UOM/L1S2/Industry%20Reconnaisance/ERAOTS-1/backend/app/api/events.py#L313-L351): The `get_recent_events` endpoint fetches each employee and scanner individually inside a loop instead of using `joinedload`.

### 8.3 No Background Task Scheduler
The `process_expired_transitions()` function exists but has **no scheduler** calling it. Expired pending transitions are never auto-confirmed.
**Fix needed:** Add a background task (e.g., `asyncio.create_task` with a loop, or Celery beat) to call this periodically.

### 8.4 Redis Not Connected
Redis is listed in requirements and docker-compose but is never used in the codebase. `OccupancyState` is queried from DB on every request instead of being cached in Redis.

### 8.5 `DATABASE_URL` Mismatch
- `.env` specifies PostgreSQL: `postgresql+asyncpg://postgres:postgres@localhost:5432/eraots`
- `config.py` defaults to SQLite: `sqlite+aiosqlite:///./eraots.db`
- The system currently runs on **SQLite** because the `.env` file loads to the `backend/` directory (one level up), but config looks for it relative to the `core/` module. **Resolution:** The `.env` file at the root level is being loaded correctly per the `Config` class path resolution — the system falls back to SQLite default because PostgreSQL isn't running.

### 8.6 Scan Endpoint Has No Authentication
`POST /api/events/scan` is completely unauthenticated. In production, this should validate the scanner's API key.

### 8.7 `requirements.txt` Has Duplicate Entry
`httpx==0.27.2` is listed twice (lines 29 and 45).

### 8.8 Audit Log Not Being Written
The `AuditLog` model exists but no API endpoint writes to it. All CRUD operations bypass audit logging.

---

## 9. Frontend → Backend API Contract Status

| Frontend API Call | Backend Endpoint | Status |
|---|---|---|
| `authAPI.login()` | POST `/api/auth/login` | ✅ Working |
| `authAPI.getMe()` | GET `/api/auth/me` | ✅ Working |
| `eventsAPI.scan()` | POST `/api/events/scan` | ✅ Working |
| `eventsAPI.recent()` | GET `/api/events/recent` | ✅ Working |
| `eventsAPI.occupancy()` | GET `/api/events/occupancy` | ✅ Working |
| `eventsAPI.statusOverride()` | PUT `/api/events/status-override` | ⚠️ Frontend sends `new_status` param but backend reads body JSON |
| `employeeAPI.create()` | POST `/api/employees` | ✅ Working |
| `hardwareAPI.register()` | POST `/api/scanners/` | ❌ Bug #2 |
| `correctionsAPI.updateStatus()` | PUT `/api/corrections/{id}/status` | ❌ Bug #1 + #3 |
| `leaveAPI.updateStatus()` | PUT `/api/schedules/leave-requests/{id}/status` | ❌ Bug #1 |
| `createDashboardSocket()` | WS `/api/events/ws/dashboard` | ✅ Working |

---

## 10. Seeded Data (Auto-Created on First Run)

| Entity | Details |
|--------|---------|
| **Roles** | SUPER_ADMIN, HR_MANAGER, MANAGER, EMPLOYEE |
| **Admin Account** | admin@eraots.com / admin123 (SUPER_ADMIN) |
| **Scanners** | Scanner Alpha (Main Entrance) + Scanner Beta (Side Entry) |
| **Policies** | Office Start Time (9:00 AM), Daily Expected Hours (480 min) |
| **Leave Types** | Annual Leave (20d), Sick Leave (14d), Unpaid Leave |

---

## 11. File Size Audit (Complexity Indicators)

| File | Lines | Notes |
|------|-------|-------|
| `backend/app/api/events.py` | **1,395** | ⚠️ God file — should be split |
| `frontend/src/pages/EmployeesPage.jsx` | 28,067 bytes | Largest React component |
| `frontend/src/pages/DashboardPage.jsx` | 22,453 bytes | Very complex |
| `frontend/src/pages/DevToolsPage.jsx` | 21,595 bytes | Admin tooling |
| `backend/app/api/reports.py` | 19,190 bytes | Export logic |
| `backend/app/api/schedules.py` | 13,689 bytes | Schedule + leave logic |
| `frontend/src/styles/index.css` | 12,639 bytes | Full design system |
| `backend/app/core/attendance_processor.py` | 12,503 bytes | Business logic |
| `backend/app/api/schemas.py` | 11,676 bytes | 30+ Pydantic models |

---

## 12. Priority Fix List (Recommended Order)

| Priority | Bug | Fix Complexity | Impact |
|----------|-----|---------------|--------|
| 🔴 P0 | Bug #1: `dispatch_notification()` field mismatch | Simple — rename field + add missing fields | Breaks leave/correction notifications |
| 🔴 P0 | Bug #2: Scanner registration missing `api_key_hash` | Simple — add hash to Scanner constructor | Cannot register scanners |
| 🔴 P0 | Bug #3: Correction approval `scanner_id=None` | Moderate — schema change or virtual scanner | Cannot approve corrections |
| 🟡 P1 | Bug #5: Emergency headcount wrong status filter | Simple — fix status values | Inaccurate emergency headcounts |
| 🟡 P1 | No background scheduler for 30-sec rule | Moderate — add asyncio task | Auto-confirm never fires |
| 🟢 P2 | N+1 queries in events API | Moderate — add `joinedload` | Performance |
| 🟢 P2 | Setup Alembic migrations | Moderate — one-time setup | Required before any schema changes |
| 🟢 P2 | Audit logging not implemented | Moderate — add middleware | Compliance |
| ⚪ P3 | statusOverride API contract mismatch | Simple — fix frontend call | UI toggle may fail |
| ⚪ P3 | Redis caching for OccupancyState | Moderate | Performance at scale |
