# StyleSeat Guardian — Test Management Application

A TestRail-like test management web application with a React frontend and Flask REST API backend.

## Quick Start

```bash
# First time: create venv and install
cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt

# First time: set up env vars
cp backend/.env.example backend/.env   # then edit and fill in CIRCLECI_API_TOKEN

# First time: authenticate GitHub CLI (needed for Cypress sync)
gh auth login

# Launch full demo (reset DB, seed, sync Cypress tests, start servers)
npm run demo
```

**Demo credentials:** `demo` / `Demo1234` at http://localhost:5173

**Manual start:**
```bash
# Backend (Terminal 1) — port 5001
cd backend && source venv/bin/activate && python seed.py && python run.py

# Frontend (Terminal 2) — port 5173
cd frontend && npm install && npm run dev

# Sync test cases from Cypress repo
npm run sync

# Import CircleCI test results
npm run import -- <circleci-workflow-url>
```

## Architecture

```
guardian/
├── backend/            # Flask REST API (Python 3.13, port 5001)
│   ├── app/
│   │   ├── __init__.py         # App factory: Flask + SQLAlchemy + JWT + CORS + rate limiting + APScheduler
│   │   ├── models.py           # 11 SQLAlchemy models (all tables)
│   │   ├── retention.py        # Data retention cleanup (scheduled daily at 2 AM)
│   │   ├── suite_utils.py      # Suite derivation: cypress_path↔name↔workflow mappings
│   │   ├── services/
│   │   │   └── circleci.py     # CircleCI API wrapper
│   │   ├── utils/
│   │   │   └── cypress_parser.py # Cypress test file parser
│   │   └── routes/
│   │       ├── auth.py         # Register, login, logout, avatar upload/serve (JWT)
│   │       ├── projects.py     # Project CRUD + stats
│   │       ├── suites.py       # Test suite CRUD (scoped to project)
│   │       ├── sections.py     # Section CRUD (self-referential tree)
│   │       ├── test_cases.py   # Test case CRUD (steps stored as JSON)
│   │       ├── test_runs.py    # Run CRUD + result management + history
│   │       └── dashboard.py    # Aggregated stats + sync logs + retention
│   ├── tests/                  # Pytest test suite
│   │   ├── conftest.py         # Fixtures: app context, client, seeded database
│   │   ├── test_auth.py        # Auth endpoints, password validation, email domain
│   │   ├── test_projects.py    # Project CRUD
│   │   ├── test_suites.py      # Suite CRUD
│   │   ├── test_sections.py    # Section CRUD, hierarchical tree
│   │   ├── test_cases.py       # Test case CRUD, steps JSON
│   │   ├── test_runs.py        # Run creation, result updates, history
│   │   ├── test_models.py      # Model serialization, relationships
│   │   └── test_dashboard.py   # Dashboard stats
│   ├── config.py               # SQLite URI, JWT secret, token expiry, upload, rate limiting, retention
│   ├── run.py                  # Entry point (port 5001, creates tables, lightweight migrations)
│   ├── sync_cypress.py         # CLI: sync test cases from Cypress repo (blob API, baseline diffing)
│   ├── import_circleci.py      # CLI: import CircleCI workflow results into a test run
│   ├── seed.py                 # Bootstrap: creates demo user + Automation Overview project
│   ├── backup_db.py            # Export app.db to JSON
│   ├── restore_db.py           # Restore database from JSON backup
│   ├── requirements.txt
│   ├── .env.example            # Template for environment variables (copy to .env)
│   ├── uploads/avatars/        # User avatar storage (auto-created)
│   └── app.db                  # SQLite database (auto-created, gitignored)
│
├── frontend/           # React 19 SPA (Vite, port 5173)
│   ├── public/
│   │   └── logo.jpg            # Brand logo
│   └── src/
│       ├── main.jsx            # Entry: BrowserRouter + AuthProvider
│       ├── App.jsx             # Route definitions + layout (collapsible sidebar + responsive main)
│       ├── index.css           # Global styles (DM Sans font, buttons, tables, forms, animations)
│       ├── styles/
│       │   └── variables.css   # CSS custom properties (colors, shadows, radii, typography)
│       ├── context/
│       │   └── AuthContext.jsx  # Auth state: user, token, login(), logout(), updateAvatar()
│       ├── constants/
│       │   └── statusColors.js  # STATUS_COLORS, STATUS_ORDER, getStatusChartData()
│       ├── utils/
│       │   └── stripTestRailId.js # Regex utility to remove C-ID prefixes
│       ├── services/
│       │   ├── api.js           # Axios instance (baseURL, JWT interceptor)
│       │   ├── authService.js   # login(), register(), getMe(), logout(), uploadAvatar()
│       │   ├── projectService.js
│       │   ├── suiteService.js
│       │   ├── sectionService.js
│       │   ├── caseService.js
│       │   ├── runService.js
│       │   ├── dashboardService.js  # Global/project dashboard + sync logs
│       │   └── soundService.js      # Sound settings (Web Audio API, localStorage)
│       ├── components/
│       │   ├── Sidebar.jsx      # Collapsible sidebar with project→suite tree nav, avatar, mobile hamburger
│       │   ├── Header.jsx       # Breadcrumb header bar
│       │   ├── StatusBadge.jsx  # Tinted pill badges
│       │   ├── PriorityBadge.jsx
│       │   ├── SectionTree.jsx  # Recursive tree from flat section list
│       │   ├── StatsCard.jsx
│       │   ├── ResizableTable.jsx
│       │   ├── CategoryList.jsx
│       │   ├── Modal.jsx        # Backdrop blur + scaleIn animation
│       │   ├── ConfirmDialog.jsx
│       │   ├── LoadingSpinner.jsx
│       │   └── ProtectedRoute.jsx
│       ├── test/
│       │   └── setup.js         # Vitest test setup
│       └── pages/
│           ├── LoginPage.jsx
│           ├── RegisterPage.jsx
│           ├── DashboardPage.jsx     # Suite cards, stats, doughnut chart, recent runs
│           ├── ProjectDetailPage.jsx # Tabs: Suites / Test Runs / Overview
│           ├── TestSuitesPage.jsx
│           ├── TestSuitePage.jsx     # Split: section tree (left) + case table (right)
│           ├── TestCaseFormPage.jsx  # Create/edit case with dynamic steps
│           ├── TestCaseDetailPage.jsx
│           ├── TestRunsPage.jsx
│           ├── TestRunDetailPage.jsx # Summary, doughnut chart, filterable results
│           └── TestExecutionPage.jsx # Execute test: status selector + comment + nav
│
├── scripts/
│   ├── start-demo.sh           # Demo launcher
│   └── start.sh                # Alternative startup
├── AWS_DEPLOYMENT_GUIDE.md
├── CLAUDE.md                   # This file
└── package.json                # Root npm scripts: demo, sync, import
```

## Database Schema

11 tables in SQLite (`backend/app.db`). All models in `backend/app/models.py`.

| Model | Table | Key Fields | Notes |
|-------|-------|-----------|-------|
| `TokenBlocklist` | `token_blocklist` | id, jti, created_at | Revoked JWT tokens. Cleaned after 7 days |
| `User` | `users` | id, username, email, password_hash, avatar | `set_password()` / `check_password()` via werkzeug |
| `Project` | `projects` | id, name, description, created_by (FK users) | Cascades delete to suites and runs |
| `Suite` | `suites` | id, project_id, name, cypress_path (nullable) | `cypress_path` is the canonical suite identifier |
| `Section` | `sections` | id, suite_id, parent_id (nullable), name, display_order | Self-referential tree. `parent_id=NULL` = root |
| `TestCase` | `test_cases` | id, section_id, title, case_type, priority, preconditions, steps (JSON), expected_result | `steps`: `[{"action": "...", "expected": "..."}]`, access via `steps_list` |
| `TestRun` | `test_runs` | id, project_id, suite_id (nullable), name, is_completed | Creating a run auto-inserts one `TestResult` per case |
| `TestResult` | `test_results` | id, run_id, case_id, status, comment, defect_id, error_message, artifacts (JSON), circleci_job_id | Status: Passed/Failed/Blocked/Retest/Untested |
| `ResultHistory` | `result_history` | id, result_id, status, comment, defect_id, error_message, artifacts (JSON), changed_by, changed_at | Appended on every status update |
| `SyncBaseline` | `sync_baselines` | id, project_id, case_ids (JSON), case_titles (JSON), case_count | Rolling snapshot for baseline diffing between syncs |
| `SyncLog` | `sync_logs` | id, sync_type, project_id, total_cases, new_cases, removed_cases, new_case_names (JSON) | Records each sync/import with diff counts |

## API Endpoints

All endpoints return JSON. All except `/api/auth/register` and `/api/auth/login` require `Authorization: Bearer <token>`.

### Auth (`/api/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register `{username, email, password}` → `{id, username, token}`. Rate: 3/min |
| POST | `/api/auth/login` | Login `{username, password}` → `{id, username, token}`. Rate: 5/min |
| GET | `/api/auth/me` | Current user info |
| POST | `/api/auth/logout` | Revoke current JWT |
| POST | `/api/auth/avatar` | Upload avatar (multipart, max 2MB, magic-byte validated) |
| GET | `/api/auth/avatars/:filename` | Serve avatar image |

### Projects (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create `{name, description}` |
| GET | `/api/projects/:id` | Get with suite/case/run counts |
| PUT | `/api/projects/:id` | Update |
| DELETE | `/api/projects/:id` | Delete (cascades) |
| GET | `/api/projects/:id/stats` | Aggregated status counts |

### Suites (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:pid/suites` | List suites (with case counts) |
| POST | `/api/projects/:pid/suites` | Create `{name, description, cypress_path?}` |
| GET | `/api/suites/:id` | Get suite |
| PUT | `/api/suites/:id` | Update (accepts `cypress_path`) |
| DELETE | `/api/suites/:id` | Delete (cascades) |

### Sections (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/suites/:sid/sections` | Flat list (frontend builds tree via `parent_id`) |
| POST | `/api/suites/:sid/sections` | Create `{name, parent_id?, display_order?}` |
| PUT | `/api/sections/:id` | Update |
| DELETE | `/api/sections/:id` | Delete (cascades children + cases) |

### Test Cases (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sections/:sid/cases` | Cases in section |
| GET | `/api/suites/:sid/cases` | All cases in suite (includes `section_name`) |
| POST | `/api/cases` | Create `{title, section_id, case_type?, priority?, preconditions?, steps?, expected_result?}` |
| GET | `/api/cases/:id` | Get detail |
| PUT | `/api/cases/:id` | Update |
| DELETE | `/api/cases/:id` | Delete |

### Test Runs (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:pid/runs` | List runs (with stats) |
| POST | `/api/projects/:pid/runs` | Create `{name, suite_id}` — auto-creates Untested results |
| GET | `/api/runs/:id` | Get with status counts |
| PUT | `/api/runs/:id` | Update |
| DELETE | `/api/runs/:id` | Delete |
| GET | `/api/runs/:id/results` | All results with case title, section, priority |
| POST | `/api/runs/:rid/complete` | Mark completed |
| GET | `/api/results/:id` | Single result with full case details |
| PUT | `/api/results/:id` | Update `{status, comment?, defect_id?}` — inserts history |
| GET | `/api/results/:id/history` | Status change history |

### Dashboard (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Global stats, suites, recent runs |
| GET | `/api/projects/:pid/dashboard` | Project runs with stats |
| GET | `/api/sync-logs` | Sync log history. Params: `project_id`, `limit` (default 20) |
| POST | `/api/retention/cleanup` | Trigger data retention cleanup |
| GET | `/api/retention/status` | Retention config and purgeable counts |

## Frontend Routes

| Path | Component | Auth |
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
- **App factory** in `app/__init__.py` — `create_app()` initializes Flask, SQLAlchemy, JWT, CORS, rate limiting, APScheduler, registers 7 Blueprints
- **All Blueprints** registered with `url_prefix="/api"` (auth: `/api/auth`)
- **Auth** via `@jwt_required()`. Token identity is `str(user.id)`
- **Token blocklist** — logout revokes JWT by storing JTI. `@jwt.token_in_blocklist_loader` checks on every request
- **Email domain restriction** — only `@styleseat.com` emails can register/login. OWASP-compliant generic errors. Constant `ALLOWED_EMAIL_DOMAIN` in `routes/auth.py`
- **Serialization** via `to_dict()` methods (no Marshmallow/Pydantic)
- **SQLite** — foreign keys enabled via PRAGMA, WAL journal mode
- **Cascade deletes** on all relationships (`cascade="all, delete-orphan"`)
- **Section tree** returned flat — frontend reconstructs via `parent_id`
- **Suite path derivation** in `suite_utils.py` — single source of truth. Suites matched by `cypress_path` column, not name
- **Data retention** — `retention.py` runs daily at 2 AM: purges completed runs older than `RETENTION_DAYS` (default 30), expired tokens (7 days), orphaned history
- **Avatar upload** — max 2MB, extension + magic byte validation, UUID filenames in `uploads/avatars/`
- **Tests** — `cd backend && python -m pytest`

### Frontend
- **Service layer**: Each entity has a service file (`services/*.js`) wrapping Axios calls
- **API base URL**: `http://localhost:5001/api` (in `services/api.js`)
- **JWT interceptor**: Adds `Authorization: Bearer` from localStorage; 401 clears token and redirects to login
- **Auth state**: `AuthContext` provides `user`, `login()`, `logout()`, `updateAvatar()`, `isAuthenticated`
- **Collapsible sidebar**: State persisted in localStorage; `App.jsx` manages `sidebarCollapsed` and `mobileOpen`
- **Sidebar refresh**: `window.__refreshSidebarProjects` triggers sidebar project list refresh
- **Icons**: Inline SVGs (no icon library), `currentColor` stroke
- **Sort order**: Projects and suites sorted by `created_at` ascending
- **Charts**: `react-chartjs-2` Doughnut charts
- **Tests** — `cd frontend && npm test` (Vitest + @testing-library/react)

### Design System
- **Color scheme**: Green-themed — buttons, focus rings, tabs all use `--sidebar-bg` (#1a3a2a). Outlined button style (white bg + border) fills on hover
- **Unified accent rule**: Decorative accents on structural UI (stat tiles, KPI cards, section icons, card borders) use the **same primary green** (`--sidebar-bg` / `--primary-light`). No per-element color theming. Status colors reserved strictly for data meaning (pass/fail results).
- **Typography**: DM Sans via `--font-sans`; sidebar brand: "StyleSeat" (semibold) + "Guardian" (light)
- **CSS architecture**: Tokens in `styles/variables.css`, component-scoped CSS, globals in `index.css`
- **Status badges**: Tinted pills — colored text on light background
- **Animations**: `fadeIn`, `slideUp`, `shimmer`, `scaleIn` keyframes; hover lift on cards; `scale(0.97)` button press
- **Auth pages**: Dark forest green gradient, lime accent (`#CDF545`), multi-stage bloom/aurora entrance animation (see `LoginPage.css`)

### Status & Priority Values
- **Statuses**: `Passed`, `Failed`, `Blocked`, `Retest`, `Untested`
- **Status colors**: Passed=#4CAF50, Failed=#F44336, Blocked=#FF9800, Retest=#00897B, Untested=#9E9E9E
- **Priorities**: `Critical`, `High`, `Medium`, `Low`
- **Priority colors**: Critical=#d32f2f, High=#f57c00, Medium=#2e7d4f, Low=#757575
- **Case types**: `Functional`, `Regression`, `Smoke`, `Performance`, `Security`, `Usability`, `Other`

### Responsive Layout Rules

3-tier breakpoint system. Every new page/component MUST follow these rules:

- **1024px** — Mid-range: hide secondary columns, shrink fixed widths, stack toolbars vertically, reduce gaps/padding, 2-col grids
- **768px** — Mobile: hide sidebar (hamburger menu), single-column layouts, minimal columns
- **640px** — Small mobile: further simplification

**Critical CSS rules:**
1. Always add `min-width: 0` on flex children with dynamic content (prevents overflow)
2. Always add `overflow-x: hidden` on content containers
3. Every fixed-width column needs a `@media (max-width: 1024px)` rule to hide or shrink

**Pattern for data rows:**
```css
.row { display: flex; align-items: center; gap: 16px; }
.row-id { flex-shrink: 0; width: 90px; }
.row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.row-secondary { flex-shrink: 0; width: 100px; }

@media (max-width: 1024px) {
  .row { gap: 8px; }
  .row-id { width: 70px; }
  .row-secondary { display: none; }
}
```

## Common Development Tasks

**Add a new API endpoint:**
1. Add route in `backend/app/routes/*.py`
2. If new blueprint: register in `backend/app/__init__.py`

**Add a new frontend page:**
1. Create `frontend/src/pages/NewPage.jsx` (and optional `.css`)
2. Add `<Route>` in `App.jsx` (wrap with `<ProtectedRoute>` if auth required)
3. Add nav link in `Sidebar.jsx` if needed

**Add a new database model:**
1. Define in `backend/app/models.py` with `to_dict()`
2. Create routes in `backend/app/routes/`
3. Register blueprint in `backend/app/__init__.py`
4. Restart backend (tables auto-created via `db.create_all()`)
5. Note: `db.create_all()` does NOT add columns to existing tables — use `ALTER TABLE` or delete `app.db` and re-seed

**Reset the database:**
```bash
cd backend && rm -f app.db && source venv/bin/activate && python seed.py
```

**Run tests:**
```bash
cd backend && source venv/bin/activate && python -m pytest   # backend
cd frontend && npm test                                       # frontend
```

**AWS deployment:** See `AWS_DEPLOYMENT_GUIDE.md`

## Test Data Workflow

Two sources of truth:

1. **Cypress Repo** (`styleseat/cypress`) → Test case definitions
   - Synced via `sync_cypress.py` / `npm run sync`
   - Matches cases by TestRail ID (`C\d+` prefix) first, then exact title
   - Strips C-ID prefixes from stored titles
   - Removes orphaned cases and empty sections (skipped if >50% file fetches fail)
   - Uses rolling baseline for change detection (`SyncBaseline` model)
   - Excluded paths: `manual/`, `utility/`, `utility_lifecycle/`, `weekly/`

2. **CircleCI** → Test results
   - Imported via `import_circleci.py` / `npm run import -- <workflow-url>`
   - Requires `CIRCLECI_API_TOKEN` in `backend/.env`
   - Three-tier matching: exact title → file-path + fuzzy (Jaccard ≥ 0.6) → unmatched to "CircleCI Only" section
   - Auto-creates test cases for new tests not yet synced
   - Failed file loads → marks tests as "Blocked"; failed jobs without results → "Untested"

**Suite mapping** is auto-derived from `cypress_path` by `suite_utils.py`. New suites are auto-created when new Cypress folders or CircleCI workflows appear.

## Launch Demo

When asked to "start demo" or "launch demo", run `npm run demo`. This kills existing servers, seeds a fresh DB, starts both servers, and syncs Cypress tests in the background.

**Login:** `demo` / `Demo1234` at http://localhost:5173