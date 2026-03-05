# StyleSeat Guardian — Test Management Application

A TestRail-like test management web application with a React frontend and Flask REST API backend. Features a modern design system with DM Sans typography, tinted status/priority badges, smooth animations, collapsible sidebar, responsive mobile layout, and user avatar uploads.

## Quick Start

```bash
# Backend (Terminal 1)
cd backend
source venv/bin/activate
python seed.py          # First time only: populate demo data
python run.py           # Starts on http://localhost:5001

# Frontend (Terminal 2)
cd frontend
npm install             # First time only
npm run dev             # Starts on http://localhost:5173

# Build frontend for production
cd frontend && npm run build
```

**Demo credentials:** `demo` / `demo123`

## Architecture

```
dashboard/
├── backend/            # Flask REST API (Python 3.13, port 5001)
│   ├── app/
│   │   ├── __init__.py         # App factory: Flask + SQLAlchemy + JWT + CORS init + uploads dir
│   │   ├── models.py           # 8 SQLAlchemy models (all tables)
│   │   └── routes/
│   │       ├── auth.py         # Register, login, current user, avatar upload/serve (JWT)
│   │       ├── projects.py     # Project CRUD + stats
│   │       ├── suites.py       # Test suite CRUD (scoped to project)
│   │       ├── sections.py     # Section CRUD (scoped to suite, self-referential tree)
│   │       ├── test_cases.py   # Test case CRUD (steps stored as JSON)
│   │       ├── test_runs.py    # Run CRUD + result management + history
│   │       └── dashboard.py    # Aggregated stats (global + per-project)
│   ├── config.py               # SQLite URI, JWT secret, token expiry, upload settings
│   ├── run.py                  # Entry point (port 5001, creates tables on start)
│   ├── seed.py                 # Demo data: 2 projects, 3 suites, 30 cases, 3 runs
│   ├── requirements.txt        # Flask, Flask-SQLAlchemy, Flask-CORS, Flask-JWT-Extended, Werkzeug
│   ├── uploads/avatars/        # User avatar image storage (auto-created)
│   └── app.db                  # SQLite database (auto-created)
│
├── frontend/           # React 19 SPA (Vite, port 5173)
│   ├── public/
│   │   └── logo.jpg            # Brand logo (lion with sunglasses), color-shifted via CSS filters
│   └── src/
│       ├── main.jsx            # Entry: BrowserRouter + AuthProvider
│       ├── App.jsx             # Route definitions + layout (collapsible sidebar + responsive main)
│       ├── index.css           # Global styles (DM Sans font, buttons, tables, forms, animations)
│       ├── styles/
│       │   └── variables.css   # CSS custom properties (colors, shadows, radii, typography, status/priority tints)
│       ├── context/
│       │   └── AuthContext.jsx  # Auth state: user, token, login(), logout(), updateAvatar(), isAuthenticated
│       ├── services/
│       │   ├── api.js           # Axios instance (baseURL: localhost:5001/api, JWT interceptor)
│       │   ├── authService.js   # login(), register(), getMe(), uploadAvatar()
│       │   ├── projectService.js
│       │   ├── suiteService.js
│       │   ├── sectionService.js
│       │   ├── caseService.js
│       │   ├── runService.js
│       │   └── dashboardService.js
│       ├── components/
│       │   ├── Sidebar.jsx      # Collapsible sidebar with brand logo, project→suite tree nav, avatar upload, mobile hamburger
│       │   ├── Header.jsx       # Breadcrumb header bar with mobile hamburger toggle
│       │   ├── StatusBadge.jsx  # Tinted pill badges (colored text on light bg)
│       │   ├── PriorityBadge.jsx # Tinted pill badges (colored text on light bg)
│       │   ├── SectionTree.jsx  # Recursive tree built from flat section list
│       │   ├── StatsCard.jsx    # Stat card with hover lift effect
│       │   ├── Modal.jsx        # Generic modal with backdrop blur + scaleIn animation
│       │   ├── ConfirmDialog.jsx # Delete confirmation dialog
│       │   ├── LoadingSpinner.jsx # Branded spinner with loading text
│       │   └── ProtectedRoute.jsx # Redirects to /login if not authenticated
│       └── pages/
│           ├── LoginPage.jsx         # Login form with brand logo lockup
│           ├── RegisterPage.jsx      # Registration form with brand logo lockup
│           ├── DashboardPage.jsx     # Project cards, global stats, doughnut chart, recent runs
│           ├── ProjectDetailPage.jsx # Tabs: Suites / Test Runs / Overview with charts
│           ├── TestSuitePage.jsx     # Split: section tree (left) + test case table (right)
│           ├── TestCaseFormPage.jsx  # Create/edit case with dynamic steps list
│           ├── TestCaseDetailPage.jsx # Read-only case view with steps table
│           ├── TestRunDetailPage.jsx # Summary bar, doughnut chart, filterable results table
│           └── TestExecutionPage.jsx # Execute test: case details + status selector + comment + prev/next nav
│
└── CLAUDE.md           # This file
```

## Database Schema

8 tables in SQLite (`backend/app.db`). All models are in `backend/app/models.py`.

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `User` | `users` | id, username, email, password_hash, avatar | `set_password()` / `check_password()` using werkzeug. `avatar` stores uploaded filename |
| `Project` | `projects` | id, name, description, created_by (FK users) | Cascades delete to suites and runs |
| `Suite` | `suites` | id, project_id (FK projects), name | Cascades delete to sections |
| `Section` | `sections` | id, suite_id (FK suites), parent_id (FK sections, nullable), name, display_order | Self-referential tree. `parent_id=NULL` = root. Frontend builds tree from flat list |
| `TestCase` | `test_cases` | id, section_id (FK sections), title, case_type, priority, preconditions, steps (JSON text), expected_result | `steps` is a JSON string: `[{"action": "...", "expected": "..."}]`. Access via `steps_list` property |
| `TestRun` | `test_runs` | id, project_id (FK projects), suite_id (FK suites), name, is_completed | Creating a run auto-inserts one `TestResult` per case in the suite |
| `TestResult` | `test_results` | id, run_id (FK test_runs), case_id (FK test_cases), status, comment, defect_id, tested_by, tested_at | Status: Passed/Failed/Blocked/Retest/Untested |
| `ResultHistory` | `result_history` | id, result_id (FK test_results), status, comment, defect_id, changed_by, changed_at | Appended on every result status update |

## API Endpoints

All endpoints return JSON. All except `/api/auth/register` and `/api/auth/login` require `Authorization: Bearer <token>`.

### Auth (`/api/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register user `{username, email, password}` → `{id, username, token}` |
| POST | `/api/auth/login` | Login `{username, password}` → `{id, username, token}` |
| GET | `/api/auth/me` | Get current user info |
| POST | `/api/auth/avatar` | Upload avatar image (multipart/form-data, JPEG/PNG, max 2MB) |
| GET | `/api/auth/avatars/:filename` | Serve uploaded avatar image file |

### Projects (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create project `{name, description}` |
| GET | `/api/projects/:id` | Get project with suite/case/run counts |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project (cascades) |
| GET | `/api/projects/:id/stats` | Aggregated status counts across all runs |

### Suites (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:pid/suites` | List suites in project (with case counts) |
| POST | `/api/projects/:pid/suites` | Create suite `{name, description}` |
| GET | `/api/suites/:id` | Get suite |
| PUT | `/api/suites/:id` | Update suite |
| DELETE | `/api/suites/:id` | Delete suite (cascades) |

### Sections (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/suites/:sid/sections` | Flat list of sections (frontend builds tree via `parent_id`) |
| POST | `/api/suites/:sid/sections` | Create section `{name, parent_id?, display_order?}` |
| PUT | `/api/sections/:id` | Update section |
| DELETE | `/api/sections/:id` | Delete section (cascades children + cases) |

### Test Cases (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sections/:sid/cases` | Cases in a section |
| GET | `/api/suites/:sid/cases` | All cases in suite (across sections, includes `section_name`) |
| POST | `/api/cases` | Create case `{title, section_id, case_type?, priority?, preconditions?, steps?, expected_result?}` |
| GET | `/api/cases/:id` | Get case detail |
| PUT | `/api/cases/:id` | Update case |
| DELETE | `/api/cases/:id` | Delete case |

### Test Runs (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:pid/runs` | List runs (with stats per run) |
| POST | `/api/projects/:pid/runs` | Create run `{name, suite_id}` — auto-creates Untested results for all cases |
| GET | `/api/runs/:id` | Get run with aggregated status counts |
| PUT | `/api/runs/:id` | Update run (mark completed, edit name) |
| DELETE | `/api/runs/:id` | Delete run |
| GET | `/api/runs/:id/results` | All results with case title, section, priority |
| GET | `/api/results/:id` | Single result with full test case details |
| PUT | `/api/results/:id` | Update result `{status, comment?, defect_id?}` — also inserts history |
| GET | `/api/results/:id/history` | Status change history for a result |

### Dashboard (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Global: projects with stats, totals, global_stats, recent_runs |
| GET | `/api/projects/:pid/dashboard` | Project: all runs with stats, overall_stats |

## Frontend Routes

| Path | Component | Auth Required |
|------|-----------|:---:|
| `/login` | LoginPage | No |
| `/register` | RegisterPage | No |
| `/` | DashboardPage | Yes |
| `/projects/:projectId` | ProjectDetailPage | Yes |
| `/projects/:projectId/suites/:suiteId` | TestSuitePage | Yes |
| `/projects/:projectId/suites/:suiteId/cases/new` | TestCaseFormPage | Yes |
| `/projects/:projectId/suites/:suiteId/cases/:caseId/edit` | TestCaseFormPage | Yes |
| `/cases/:caseId` | TestCaseDetailPage | Yes |
| `/runs/:runId` | TestRunDetailPage | Yes |
| `/runs/:runId/execute/:resultId` | TestExecutionPage | Yes |

## Key Patterns

### Backend
- **App factory** in `app/__init__.py` — `create_app()` initializes Flask, SQLAlchemy, JWT, CORS, registers 7 Blueprints, creates uploads directory
- **All Blueprints** registered with `url_prefix="/api"` (except auth: `/api/auth`)
- **Auth** via `@jwt_required()` decorator on every non-auth endpoint. Token identity is `str(user.id)`
- **Serialization** via `to_dict()` methods on each model (no Marshmallow/Pydantic)
- **SQLite foreign keys** enabled via `@sa_event.listens_for(Engine, "connect")` PRAGMA
- **Cascade deletes** configured on SQLAlchemy relationships (`cascade="all, delete-orphan"`)
- **Section tree** returned as a flat list — frontend reconstructs the tree using `parent_id`
- **Test case steps** stored as JSON text in the `steps` column, accessed via `steps_list` property
- **Avatar upload** accepts JPEG/PNG (max 2MB), stores files in `uploads/avatars/` with user ID prefix, served via `send_from_directory`

### Frontend
- **Service layer**: Each entity has a service file (`services/*.js`) wrapping Axios calls
- **API base URL**: `http://localhost:5001/api` (configured in `services/api.js`)
- **JWT interceptor**: Axios request interceptor adds `Authorization: Bearer` from localStorage; 401 response interceptor clears token and redirects to login
- **Auth state**: `AuthContext` provides `user`, `login()`, `logout()`, `updateAvatar()`, `isAuthenticated` via React Context
- **Collapsible sidebar**: Sidebar collapse state persisted in localStorage; `App.jsx` manages `sidebarCollapsed` and `mobileOpen` states
- **Sidebar suite filtering**: Projects expand to show their suites inline; auto-expands current project based on URL path; suites fetched via `suiteService.getByProject()`
- **Mobile responsive**: `useIsMobile()` hook (768px breakpoint) triggers hamburger menu, overlay backdrop, slide-in sidebar, auto-close on navigation
- **Avatar upload**: Click avatar badge/image in sidebar footer → hidden file input → uploads via `authService.uploadAvatar()` → updates AuthContext
- **Sidebar refresh**: `window.__refreshSidebarProjects` function allows any page to trigger sidebar project list refresh after creating/deleting projects
- **Icons**: Inline SVG icons (no icon library). Sidebar uses SVG with `currentColor` stroke for theme-aware rendering
- **Sort order**: Projects and suites are sorted by `created_at` ascending (oldest first)
- **Charts**: `react-chartjs-2` Doughnut charts for test result distribution

### Design System
- **Brand logo**: Green lion icon (`public/logo.jpg`) displayed in sidebar header and auth pages; logo is natively green so no hue-shift filter needed; multi-layer box-shadow for depth
- **Color scheme**: Fully green-themed — `btn-primary`, `btn-secondary`, `btn-danger`, input focus rings, and active tabs all use `--sidebar-bg` (#1a3a2a) green instead of blue. Buttons use outlined style (white bg + colored border) that fills on hover
- **Typography**: DM Sans (Google Fonts) as primary font via `--font-sans` variable; sidebar brand uses "StyleSeat" (semibold) + "Guardian" (light weight) split for Apple-style wordmark
- **CSS architecture**: Design tokens in `styles/variables.css`, component-scoped CSS files, global styles in `index.css`
- **Shadows**: Multi-layer elevation system (`--shadow-xs` through `--shadow-xl`)
- **Border radii**: Rounded scale (`--radius-sm: 6px` through `--radius-full: 9999px`)
- **Status badges**: Tinted pill style — colored text on light tinted background (e.g., green text on `#e8f5e9`)
- **Priority badges**: Tinted pill style matching status badge pattern
- **Animations**: `fadeIn`, `slideUp`, `shimmer`, `scaleIn` keyframes; hover lift effects on cards; `scale(0.97)` button press
- **Modal**: Backdrop blur (`backdrop-filter: blur(4px)`) with `scaleIn` entrance animation
- **Auth pages**: Dark forest green gradient background, centered brand lockup (96px icon + wordmark + tagline), lime accent button color (`#CDF545`). Features a multi-stage entrance animation:
  - **Bloom effect** (`authCardBloom`, 0.4s): Card expands from `scale(0)` circle (`border-radius: 200px`) to full rectangle (`16px`), with glow growing proportionally via `px`-based border-radius for smooth CSS interpolation
  - **Boom burst** (`auraBoom`, 0.5s, delayed 0.35s): Fires at full expansion — massive 1100px light shockwave (lime → teal → cyan → purple) that settles to 650px resting glow
  - **Aurora glow** (`auroraGlow`, 6s infinite loop, delayed 0.9s): Continuous polar-light color cycling on the resting card — shifts between lime green, teal/cyan, and blue/purple across 7 box-shadow layers (up to 650px spread)
  - **Halo layers**: `::before` (600px) and `::after` (900px) pseudo-elements with radial gradients fade in via `haloAppear`, then breathe via `haloBreath` (4s infinite)
  - **Content reveal** (`authContentReveal`, 0.3s, delayed 0.25s): Card children fade up (`translateY(8px)` → `0`) after bloom completes, so the card opens first then reveals its contents

### Status & Priority Values
- **Test statuses**: `Passed`, `Failed`, `Blocked`, `Retest`, `Untested`
- **Status colors**: Passed=#4CAF50, Failed=#F44336, Blocked=#FF9800, Retest=#00897B, Untested=#9E9E9E
- **Status tint backgrounds**: Passed=#e8f5e9, Failed=#ffebee, Blocked=#fff3e0, Retest=#e0f2f1, Untested=#f5f5f5
- **Priorities**: `Critical`, `High`, `Medium`, `Low`
- **Priority colors**: Critical=#d32f2f, High=#f57c00, Medium=#2e7d4f, Low=#757575
- **Priority tint backgrounds**: Critical=#ffebee, High=#fff3e0, Medium=#e8f5e9, Low=#f5f5f5
- **Case types**: `Functional`, `Regression`, `Smoke`, `Performance`, `Security`, `Usability`, `Other`

## Common Development Tasks

**Add a new API endpoint:**
1. Add route function in the appropriate `backend/app/routes/*.py` file
2. If new blueprint: register it in `backend/app/__init__.py`

**Add a new frontend page:**
1. Create `frontend/src/pages/NewPage.jsx` (and optional `.css`)
2. Add `<Route>` in `frontend/src/App.jsx` (wrap with `<ProtectedRoute>` if auth required)
3. Add navigation link in `Sidebar.jsx` if needed

**Add a new database model:**
1. Define model class in `backend/app/models.py` with `to_dict()` method
2. Create route file in `backend/app/routes/`
3. Register blueprint in `backend/app/__init__.py`
4. Restart backend (tables auto-created via `db.create_all()` in `run.py`)
5. Note: `db.create_all()` does NOT add columns to existing tables — use `ALTER TABLE` for migrations

**Reset the database:**
```bash
cd backend
rm app.db
python run.py       # Creates empty tables
python seed.py      # Optional: populate demo data
```

**Add a new frontend service:**
1. Create `frontend/src/services/newService.js` following the pattern in existing services
2. Import and use in page components

## Dependencies

### Python (backend/requirements.txt)
- Flask 3.1.0
- Flask-SQLAlchemy 3.1.1
- Flask-CORS 5.0.0
- Flask-JWT-Extended 4.7.1
- Werkzeug 3.1.3

### Node (frontend/package.json)
- react 19.2, react-dom 19.2
- react-router-dom 7.13
- axios 1.13
- chart.js 4.5, react-chartjs-2 5.3
- vite 7.3 (dev)

## Port Configuration
- Backend API: **5001** (macOS uses 5000 for AirTunes)
- Frontend dev server: **5173** (Vite default)
- CORS configured to allow `http://localhost:5173` and `http://127.0.0.1:5173`

## Upload Configuration
- **Avatar storage**: `backend/uploads/avatars/` (auto-created on app start)
- **Max file size**: 2MB (`MAX_CONTENT_LENGTH` in `config.py`)
- **Allowed formats**: JPEG, PNG
- **Filename pattern**: `{user_id}_{secure_filename}` to avoid collisions
