# ERAOTS — AI-Assisted Development Guidelines
## ⚠️ PASTE THIS ENTIRE DOCUMENT INTO EVERY AI PROMPT BEFORE ASKING FOR CODE CHANGES

> **Purpose:** This document is the single source of truth for how AI models should interact with the ERAOTS codebase. Every team member MUST include this as context in every prompt to prevent breaking changes, regressions, and architectural violations.

---

## 🔒 GOLDEN RULES (NON-NEGOTIABLE)

1. **READ BEFORE YOU WRITE.** You MUST read and understand every file you intend to modify before making any changes. List the files you read in your response.
2. **CHANGE ONLY WHAT IS ASKED.** Do not refactor, rename, reorganize, or "improve" anything that was not explicitly requested.
3. **PRESERVE ALL EXISTING BEHAVIOR.** Every feature that works today must still work after your changes. Zero regressions.
4. **ADD, DON'T REPLACE.** When adding new features, extend existing patterns — do not rewrite or replace working code.
5. **SHOW YOUR WORK.** Before writing any code, output a summary of: what files you read, what you understood, what you plan to change, and what you will NOT touch.

---

## 📋 MANDATORY PRE-FLIGHT CHECKLIST

Before writing ANY code, the AI model must complete this checklist and display the results:

```
┌─────────────────────────────────────────────────────────────┐
│ ERAOTS PRE-FLIGHT CHECKLIST                                 │
├─────────────────────────────────────────────────────────────┤
│ [ ] 1. Read this CONTRIBUTING_GUIDELINES.md completely      │
│ [ ] 2. Read README.md for project overview                  │
│ [ ] 3. Identified which layer(s) the task affects           │
│        □ Backend (Python/FastAPI)                           │
│        □ Frontend (React/Vite)                              │
│        □ Database (SQLAlchemy models)                       │
│        □ API contracts (schemas + endpoints)                │
│ [ ] 4. Read ALL files that will be modified                 │
│ [ ] 5. Read ALL files that IMPORT from files being modified │
│ [ ] 6. Identified the existing patterns to follow           │
│ [ ] 7. Listed what will NOT be changed                      │
│ [ ] 8. Confirmed no naming conflicts with existing code     │
│ [ ] 9. Verified the change doesn't break any API contracts  │
│ [ ] 10. Plan documented and approved before coding          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ PROJECT ARCHITECTURE — UNDERSTAND BEFORE YOU TOUCH

### Technology Stack
| Layer        | Technology                     | Key Files                          |
|-------------|-------------------------------|------------------------------------|
| Backend     | Python 3.11+ / FastAPI        | `backend/app/`                     |
| Frontend    | React 19 / Vite 8             | `frontend/src/`                    |
| Database    | SQLAlchemy 2.0 (async)        | `backend/app/models/`              |
| ORM         | Async SQLAlchemy + aiosqlite  | `backend/app/core/database.py`     |
| Auth        | JWT (python-jose) + bcrypt    | `backend/app/core/security.py`     |
| API Client  | Axios                         | `frontend/src/services/api.js`     |
| Styling     | Vanilla CSS (Vigilant Glass)  | `frontend/src/styles/index.css`    |
| State       | React Context                 | `frontend/src/context/`            |
| Routing     | React Router v7               | `frontend/src/App.jsx`             |

### Directory Map
```
ERAOTS-1/
├── backend/
│   └── app/
│       ├── api/              # REST endpoints (one file per domain)
│       │   ├── auth.py       # Login, JWT, profile
│       │   ├── events.py     # Scan events, occupancy, WebSocket
│       │   ├── employees.py  # Employee + Department CRUD
│       │   ├── attendance.py # Attendance processing
│       │   ├── schedules.py  # Schedules + Leave
│       │   ├── corrections.py# Attendance corrections
│       │   ├── notifications.py # Notification endpoints
│       │   ├── emergency.py  # Emergency evacuation
│       │   ├── scanners.py   # Hardware scanner management
│       │   ├── settings.py   # System policies
│       │   ├── reports.py    # Export reports (CSV/Excel/PDF)
│       │   └── schemas.py    # ALL Pydantic schemas (shared)
│       ├── core/             # Infrastructure (DO NOT MODIFY without approval)
│       │   ├── config.py     # Environment settings (pydantic-settings)
│       │   ├── database.py   # Async engine + session factory
│       │   ├── security.py   # JWT, bcrypt, API keys
│       │   ├── dependencies.py # FastAPI DI (get_current_user, require_roles)
│       │   ├── attendance_processor.py # Business logic
│       │   ├── notifications.py # Notification helper
│       │   └── types.py      # Shared type definitions
│       ├── models/           # SQLAlchemy ORM models
│       │   ├── __init__.py   # ⚡ Model registry — MUST import new models here
│       │   ├── employee.py   # Employee, Department, Role, UserAccount
│       │   ├── events.py     # ScanEvent, OccupancyState, PendingStateTransition
│       │   ├── attendance.py # AttendanceRecord
│       │   ├── schedule.py   # Schedule, LeaveType, LeaveRequest, Holiday
│       │   ├── notifications.py # Notification, NotificationPreference
│       │   ├── corrections.py# CorrectionRequest
│       │   ├── policies.py   # Policy
│       │   ├── emergency.py  # EmergencyEvent, EmergencyHeadcount
│       │   ├── hardware.py   # Scanner, ScannerHealthLog
│       │   └── audit.py      # AuditLog
│       └── main.py           # App entry point + router registration + seeding
├── frontend/
│   └── src/
│       ├── App.jsx           # Route definitions + ProtectedRoute + RoleRoute
│       ├── main.jsx          # React DOM render entry point
│       ├── context/
│       │   ├── AuthContext.jsx  # Auth state + role helpers
│       │   └── ThemeContext.jsx # Light/dark theme toggle
│       ├── layouts/
│       │   └── AppLayout.jsx # Sidebar + Header + main content area
│       ├── pages/            # One file per page (18 pages)
│       ├── services/
│       │   └── api.js        # ALL API calls (Axios instance + interceptors)
│       └── styles/
│           └── index.css     # Vigilant Glass design system (7800+ lines)
└── docs/                     # SRS + ER Diagram (reference only)
```

---

## 🚫 FORBIDDEN ZONES — DO NOT MODIFY WITHOUT EXPLICIT REQUEST

These files form the system's foundation. Modifying them has cascading effects across the entire application. **Never modify these unless the user's request explicitly targets them:**

### Critical Infrastructure Files
| File | Why It's Protected |
|------|-------------------|
| `backend/app/core/database.py` | Engine, session factory, Base class — everything depends on this |
| `backend/app/core/security.py` | JWT creation/validation, password hashing — breaks all auth |
| `backend/app/core/config.py` | Settings class — changes affect every module |
| `backend/app/core/dependencies.py` | `get_current_user`, `require_roles` — used by every protected endpoint |
| `backend/app/main.py` | App setup, CORS, router registration, DB seeding — the backbone |
| `frontend/src/App.jsx` | All routes, ProtectedRoute, RoleRoute — the app skeleton |
| `frontend/src/context/AuthContext.jsx` | Auth state, login/logout, role helpers — used everywhere |
| `frontend/src/services/api.js` | HTTP client, interceptors, all API functions — frontend lifeline |
| `frontend/src/styles/index.css` | 7800+ lines of design system — visual consistency depends on this |
| `backend/app/models/__init__.py` | Model registry — breaking this prevents DB table creation |

### Rules for Protected Files
1. **NEVER refactor** these files "while you're at it"
2. **NEVER change function signatures** in these files
3. **NEVER rename variables** that are imported elsewhere
4. **NEVER remove** existing imports, functions, or exports
5. If you must ADD to these files (e.g., new route in `main.py`), add at the END and follow exact existing patterns

---

## 📏 PATTERNS YOU MUST FOLLOW

### Backend Patterns

#### Adding a New API Endpoint
1. Add the endpoint in the appropriate `backend/app/api/<domain>.py` file
2. Follow the existing pattern for that file (router prefix, tags, dependencies)
3. Use `Depends(get_current_user)` or `Depends(require_roles([...]))` for auth
4. Use `db: AsyncSession = Depends(get_db)` for database access
5. Define request/response schemas in `backend/app/api/schemas.py`
6. **DO NOT** create new schema files — everything goes in `schemas.py`

**Example pattern (copy this exactly):**
```python
@router.get("/your-endpoint", response_model=YourResponseSchema, tags=["YourDomain"])
async def your_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """Descriptive docstring."""
    # Your logic here
    pass
```

#### Adding a New Database Model
1. Create the model in `backend/app/models/<domain>.py` (or add to existing file)
2. Inherit from `Base` (imported from `app.core.database`)
3. **MANDATORY:** Import the new model in `backend/app/models/__init__.py` and add to `__all__`
4. Use `uuid4` for primary keys (follow existing patterns)
5. Use `Column`, NOT `mapped_column` — follow the existing style
6. **NEVER modify existing model fields** unless explicitly asked

**Example pattern:**
```python
from app.core.database import Base
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
import uuid
from datetime import datetime, timezone

class YourModel(Base):
    __tablename__ = "your_table"
    
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # ... your columns
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

#### Adding a New Router
If you genuinely need a new API router file:
1. Create `backend/app/api/<new_domain>.py`
2. Define: `router = APIRouter(prefix="/api/<domain>", tags=["Domain Name"])`
3. Register in `backend/app/main.py`: Add `from app.api import <new_domain>` to imports and `app.include_router(<new_domain>.router)` after the last existing router
4. **Add import and registration at the END of the existing lists — do not reorder**

### Frontend Patterns

#### Adding a New Page
1. Create `frontend/src/pages/YourPage.jsx`
2. Follow the existing page structure (page-container, page-header, bento-grid, card, glass classes)
3. Add the route in `frontend/src/App.jsx` — follow existing pattern
4. If the page needs role protection, wrap with `<RoleRoute allowedRoles={[...]}>`
5. Add navigation item in `frontend/src/layouts/AppLayout.jsx` — follow existing nav-item pattern
6. **Use CSS classes from `index.css`** — do NOT write inline styles or create new CSS files

**Page structure pattern:**
```jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { yourAPI } from '../services/api';

export default function YourPage() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await yourAPI.list();
      setData(res.data);
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">YOUR <span className="highlight">PAGE</span></h1>
          <p className="page-subtitle">Description here</p>
        </div>
      </div>
      {/* Use bento-grid, card, glass classes — NOT custom CSS */}
    </div>
  );
}
```

#### Adding a New API Call
1. Add to `frontend/src/services/api.js` under the correct section
2. Follow the existing naming pattern: `domainAPI.action()`
3. **Do NOT create new Axios instances** — use the existing `api` instance
4. **Do NOT create new service files** — everything goes in `api.js`
5. Export the new API object from `api.js`

**Example:**
```javascript
// ==================== YOUR DOMAIN ====================
export const yourDomainAPI = {
  list: (params) => api.get('/api/your-domain', { params }),
  get: (id) => api.get(`/api/your-domain/${id}`),
  create: (data) => api.post('/api/your-domain', data),
  update: (id, data) => api.put(`/api/your-domain/${id}`, data),
};
```

### Design System Rules (Vigilant Glass)

1. **Fonts:** `var(--font-headline)` for headings/labels, `var(--font-body)` for body text
2. **Colors:** Use CSS variables ONLY — `var(--primary)`, `var(--on-surface)`, `var(--secondary)`, etc.
3. **Cards:** Use `.card` class with `.glass` or `.glass-subtle` — never raw `background-color`
4. **Buttons:** Use `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon` — never custom buttons
5. **Forms:** Use `.form-group`, `.form-label`, `.form-input` — never raw `<input>` styles
6. **Layout:** Use `.bento-grid`, `.bento-grid-4`, `.bento-span-2` — never raw `display: grid`
7. **Spacing:** Use `.page-container` for page padding — never hardcode padding
8. **Status colors:** Use `var(--status-active)`, `var(--status-meeting)`, `var(--status-break)`, etc.
9. **Dark mode:** All colors adapt automatically via CSS variables — NEVER use hardcoded colors
10. **Icons:** Use Material Symbols (`<span className="material-symbols-outlined">icon_name</span>`)
11. **DO NOT add new CSS files** — add styles to `index.css` at the END of the file
12. **DO NOT use Tailwind** or any utility-first CSS framework

---

## 🔗 CRITICAL DEPENDENCY CHAINS — WHAT BREAKS WHAT

Understanding these chains prevents accidental breakage:

```
database.py (Base, engine, get_db)
    ↓ imported by
models/*.py (all models inherit Base)
    ↓ imported by  
models/__init__.py (registry — SQLAlchemy discovers tables here)
    ↓ imported by
main.py (creates tables on startup)
    ↓ also
api/*.py (queries models in endpoints)

security.py (JWT, bcrypt)
    ↓ imported by
dependencies.py (get_current_user decodes JWT)
    ↓ imported by
api/*.py (every protected endpoint)

config.py (settings)
    ↓ imported by
EVERYTHING (database.py, security.py, main.py)

schemas.py (Pydantic models)
    ↓ imported by
api/*.py (request/response validation)

api.js (Axios + interceptors)
    ↓ imported by
Every React page and AuthContext.jsx

AuthContext.jsx (user, login, logout, roles)
    ↓ imported by
App.jsx (ProtectedRoute, RoleRoute)
    ↓ imported by
Every protected page

index.css (design system)
    ↓ used by
Every React component
```

**If you change a file on the LEFT side of these chains, you MUST verify everything on the RIGHT side still works.**

---

## 🛡️ DAMAGE CONTROL PROTOCOL

### Before Every Change — Impact Assessment
Ask yourself these questions and document the answers:

1. **What files am I modifying?** (List them)
2. **What other files import from these files?** (Trace the dependency chain)
3. **Am I changing any function signatures?** (If yes, find ALL callers)
4. **Am I changing any database model fields?** (If yes, existing data could break)
5. **Am I changing any API response shapes?** (If yes, frontend will break)
6. **Am I changing any CSS class names?** (If yes, multiple pages will break)
7. **Am I removing anything?** (If yes, what depends on it?)

### Change Classification System

Label your change with one of these risk levels:

| Risk Level | Description | Examples | Action Required |
|-----------|-------------|---------|-----------------|
| 🟢 **LOW** | Isolated addition, no existing code touched | New page, new standalone endpoint | Self-contained, proceed |
| 🟡 **MEDIUM** | Modifies existing file but not signatures/contracts | Bug fix in endpoint logic, CSS style tweak | Read all importers first |
| 🔴 **HIGH** | Changes API contracts, model fields, or shared code | Schema changes, new required field, rename | Full impact analysis required |
| ⛔ **CRITICAL** | Changes infrastructure files | config.py, database.py, security.py | DO NOT proceed without explicit user approval |

### Rollback Plan
For every change, the AI should provide:
1. **What was changed** (exact files and line ranges)
2. **What the original code looked like** (before diff)
3. **How to undo it** (manual steps if git is not available)

---

## ✅ POST-CHANGE VERIFICATION CHECKLIST

After making changes, verify all of the following:

### Backend Verification
```bash
# 1. Does the server start?
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. Do the API docs load?
# Visit: http://localhost:8000/docs

# 3. Can you still login?
# POST /api/auth/login with admin@eraots.com / admin123

# 4. Run existing tests
cd backend
python -m pytest testing/ -v
```

### Frontend Verification
```bash
# 1. Does it build without errors?
cd frontend
npm run build

# 2. Does it start?
npm run dev

# 3. Manual checks:
# - Can you login? (admin@eraots.com / admin123)
# - Does the dashboard load?
# - Do all sidebar navigation links work?
# - Does light/dark mode toggle work?
# - Do all pages that existed before still render?
```

### Database Verification
- If you added new models: Are they registered in `models/__init__.py`?
- Do tables get created on server start? (Check for errors in terminal)
- Did you run the server at least once to create new tables?

---

## 🚨 COMMON MISTAKES TO AVOID

### Backend Mistakes
| ❌ Don't | ✅ Do Instead |
|----------|--------------|
| Create new schema files | Add schemas to `backend/app/api/schemas.py` |
| Create new service files | Add to the existing `api/<domain>.py` |
| Use synchronous database operations | Use `async/await` with `AsyncSession` |
| Import `Base` from anywhere else | Always: `from app.core.database import Base` |
| Skip model registration | Always update `models/__init__.py` with new model imports |
| Change `get_db()` behavior | Extend functionality in your endpoint instead |
| Hardcode config values | Use `from app.core.config import settings` |
| Change existing Pydantic field types | Add new optional fields instead |

### Frontend Mistakes
| ❌ Don't | ✅ Do Instead |
|----------|--------------|
| Create new `.css` files | Append styles to `frontend/src/styles/index.css` |
| Use inline styles extensively | Use existing design system CSS classes |
| Create new Axios instances | Use the `api` instance from `services/api.js` |
| Create new context providers (without asking) | Extend existing contexts or use local state |
| Hardcode colors like `#ff0000` | Use `var(--primary)` and other CSS variables |
| Break the Bento Grid layout | Use `.bento-grid`, `.card`, `.glass` classes |
| Skip role-based route protection | Wrap with `<RoleRoute>` in `App.jsx` |
| Create new service files | Add API calls to `services/api.js` |
| Use Tailwind or utility classes | Use Vigilant Glass design system classes |

### Database/Model Mistakes
| ❌ Don't | ✅ Do Instead |
|----------|--------------|
| Delete or rename existing columns | Add new columns with defaults, deprecate old ones |
| Change primary key types | Use the existing `UUID` pattern for all new models |
| Add non-nullable columns without defaults | Always provide a `default` or `server_default` |
| Forget to add `created_at` timestamp | Follow existing model patterns |
| Use `Integer` for IDs | Use `UUID` (the project standard) |

---

## 📝 PROMPT TEMPLATE FOR TEAM MEMBERS

Use this template when prompting the AI:

```
[PASTE THE ENTIRE CONTRIBUTING_GUIDELINES.md HERE]

--- TASK START ---

**What I want to do:**
[Describe the feature/fix in detail]

**Which part of the system does this affect?**
□ Backend API endpoints
□ Database models  
□ Frontend pages
□ Frontend API calls
□ Styling/CSS
□ Configuration

**Files I think need to change:**
[List any files you know about, or say "I'm not sure"]

**Acceptance criteria:**
[What should work when you're done?]

--- TASK END ---
```

---

## 🔄 GIT WORKFLOW FOR THE TEAM

### Branch Naming
```
feature/<your-name>/<short-description>
fix/<your-name>/<short-description>
```

### Commit Messages
```
feat(backend): add leave balance calculation endpoint
fix(frontend): correct employee table pagination
style(css): add alert notification card styles
```

### Pull Request Checklist (Manual)
Before merging your branch:
- [ ] Server starts without errors
- [ ] Frontend builds without errors (`npm run build`)
- [ ] You can log in as admin
- [ ] Dashboard loads with data
- [ ] The feature you added works
- [ ] All pre-existing pages still render
- [ ] Light/dark mode still works
- [ ] No console errors in browser dev tools

---

## 📊 EXISTING API CONTRACTS — DO NOT BREAK THESE

These are the currently working endpoints. Any change that alters these response shapes will break the frontend:

| Method | Endpoint | Response Schema | Used By |
|--------|----------|----------------|---------|
| POST | `/api/auth/login` | `TokenResponse` | LoginPage, AuthContext |
| GET | `/api/auth/me` | `UserInfo` | AuthContext (on every load) |
| POST | `/api/events/scan` | `ScanEventResponse` | DevToolsPage, Simulator |
| GET | `/api/events/recent` | `List[ScanEventResponse]` | DashboardPage |
| GET | `/api/events/occupancy` | `OccupancyOverview` | DashboardPage |
| GET | `/api/events/occupancy/employees` | `List[EmployeeOccupancyState]` | DashboardPage |
| GET | `/api/employees` | `List[EmployeeResponse]` | EmployeesPage |
| POST | `/api/employees` | `EmployeeResponse` | EmployeesPage |
| GET | `/api/departments` | `List[DepartmentResponse]` | DepartmentsPage, EmployeesPage |
| GET | `/api/attendance/` | `List[AttendanceRecord]` | AttendancePage |
| GET | `/api/schedules/` | Schedules list | SchedulesPage |
| GET | `/api/corrections/` | Corrections list | CorrectionsPage |
| GET | `/api/notifications/` | Notifications list | NotificationsPage |
| GET | `/api/emergency/active` | Emergency event | EmergencyPage |
| GET | `/api/scanners/` | Scanner list | ScannersPage |
| GET | `/api/settings/policies` | Policy list | SettingsPage |
| WS | `/api/events/ws/dashboard` | Live events | DashboardPage |

**⚠️ Adding new OPTIONAL fields to responses is SAFE. Removing fields or changing types is NOT.**

---

## 🎯 QUICK REFERENCE — WHAT CAN I SAFELY DO?

| Action | Safe? | Notes |
|--------|-------|-------|
| Add a new page | ✅ Yes | Create file in `pages/`, add route in `App.jsx` |
| Add a new API endpoint | ✅ Yes | Add to existing `api/<domain>.py`, register if new router |
| Add a new database model | ✅ Yes | Create in `models/`, register in `__init__.py` |
| Add new CSS styles | ✅ Yes | Append to END of `index.css` |
| Add optional field to schema | ✅ Yes | Use `Optional[type] = None` |
| Fix a bug in existing logic | ✅ Yes | Keep same function signature |
| Add a new API call in frontend | ✅ Yes | Add to `services/api.js` |
| Rename an existing function | ❌ No | Will break all callers |
| Remove a database column | ❌ No | Will break queries |
| Change an API response shape | ❌ No | Will break frontend |
| Modify `database.py` | ❌ No | Affects everything |
| Modify `security.py` | ❌ No | Breaks auth |
| Change CSS class names | ❌ No | Breaks all pages using that class |
| Reorganize file structure | ❌ No | Breaks all imports |
| Update dependencies | ⚠️ Ask | Could introduce breaking changes |
| Change `.env` variables | ⚠️ Ask | Affects config loading |

---

## 🧮 DAMAGE ASSESSMENT — HOW MUCH CAN WE CONTROL?

### What These Guidelines Protect Against (~80% of common issues)
| Threat | Protection Level | How |
|--------|-----------------|-----|
| Accidental deletion of working code | 🟢 High | "Add, don't replace" rule |
| Breaking API contracts | 🟢 High | Response schema freeze table |
| Style/theme regressions | 🟢 High | CSS variable enforcement |
| Auth system breakage | 🟢 High | Forbidden zones list |
| Import chain breakage | 🟡 Medium | Dependency chain documentation |
| Database corruption | 🟡 Medium | Model modification rules |
| Subtle logic bugs | 🟡 Medium | Pre-flight + post-change checklists |
| Merge conflicts | 🟡 Medium | Branch workflow + isolated changes |

### What These Guidelines CANNOT Fully Prevent (~20% residual risk)
| Threat | Why It's Hard to Prevent | Mitigation |
|--------|-------------------------|------------|
| Subtle state management bugs | AI can't run the code to verify | Manual testing after each change |
| Race conditions in async code | Requires deep understanding | Code review by team lead |
| CSS specificity conflicts | New styles may accidentally override | Use unique class name prefixes |
| Browser compatibility issues | AI can't test browsers | Test in Chrome + Firefox minimum |
| Performance regressions | Hard to detect without profiling | Monitor page load times |
| Inconsistent error handling | Each contributor may handle differently | Follow try/catch pattern in existing code |

### Risk Reduction Strategy
```
Without guidelines:  ~60% chance of breaking something per contribution
With guidelines:     ~15% chance of breaking something per contribution
With guidelines + testing: ~5% chance of breaking something
```

**The remaining 5% requires:**
1. A human team lead reviewing each PR  
2. Running the full test suite before merging  
3. Manual QA on critical paths (login → dashboard → key features)

---

## 📎 APPENDIX: ROLES AND PERMISSIONS

The system has 4 roles in hierarchical order:

| Role | Access Level | Frontend Pages |
|------|-------------|----------------|
| `EMPLOYEE` | Own data only | Dashboard, My Profile, My Attendance, My Schedule, Notifications, Corrections |
| `MANAGER` | Department data | All employee pages + Team, Team Attendance, Team Schedules |
| `HR_MANAGER` | All data | All pages except Dev Tools |
| `SUPER_ADMIN` | Full access + system config | All pages including Dev Tools |

When adding new features, respect this hierarchy using `require_roles()` on backend and `<RoleRoute>` on frontend.

---

*Last updated: 2026-04-11*  
*Version: 1.0*  
*Maintainer: ERAOTS Team Lead*
