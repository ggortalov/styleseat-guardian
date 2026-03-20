# StyleSeat Guardian — Test Management Application

A TestRail-like test management web application with a React frontend and Flask REST API backend. Features a modern design system with DM Sans typography, tinted status/priority badges, smooth animations, collapsible sidebar, responsive mobile layout, and user avatar uploads.

## Quick Start

### 1. Environment Setup (first time only)

```bash
# Copy the environment template
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in your credentials:

| Variable | Required | How to get it |
|----------|:--------:|---------------|
| `CIRCLECI_API_TOKEN` | **Yes** (for imports) | [CircleCI → User Settings → Personal API Tokens](https://app.circleci.com/settings/user/tokens) |
| `CIRCLECI_PROJECT_SLUG` | No | Defaults to `gh/styleseat/cypress` |
| `JWT_SECRET_KEY` | No | Auto-generated if not set |

The `.env` file is gitignored and auto-loaded by `python-dotenv` — no need to `export` variables manually.

### 2. GitHub CLI Authentication

The Cypress sync script uses the GitHub CLI (`gh`). Authenticate once:

```bash
gh auth login
gh auth status   # Verify: needs 'repo' scope for styleseat/cypress
```

### 3. Run

```bash
# Launch full demo (reset DB, sync Cypress tests, start servers)
npm run demo

# Or start manually:

# Backend (Terminal 1)
cd backend
source venv/bin/activate
python seed.py          # First time only: create demo user + project
python sync_cypress.py  # Sync test cases from Cypress repo
python run.py           # Starts on http://localhost:5001

# Frontend (Terminal 2)
cd frontend
npm install             # First time only
npm run dev             # Starts on http://localhost:5173

# Sync test cases from Cypress repo (from project root)
npm run sync

# Import CircleCI test results (from project root)
npm run import -- <circleci-workflow-url>

# Build frontend for production
cd frontend && npm run build
```

**Demo credentials:** `demo` / `Demo1234`

## Architecture

```
dashboard/
├── backend/            # Flask REST API (Python 3.13, port 5001)
│   ├── app/
│   │   ├── __init__.py         # App factory: Flask + SQLAlchemy + JWT + CORS init + uploads dir
│   │   ├── models.py           # 8 SQLAlchemy models (all tables)
│   │   ├── suite_utils.py      # Shared suite derivation: cypress_path↔name↔workflow mappings
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
│   ├── sync_cypress.py          # CLI script: sync test cases from Cypress repo into Guardian
│   ├── import_circleci.py       # CLI script: import CircleCI workflow results into a test run
│   ├── seed.py                 # Bootstrap: creates demo user + Cypress Automation project
│   ├── requirements.txt        # Flask, Flask-SQLAlchemy, Flask-CORS, Flask-JWT-Extended, Werkzeug
│   ├── .env.example            # Template for environment variables (copy to .env)
│   ├── .env                    # Local environment variables (gitignored, auto-loaded by python-dotenv)
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
| `Suite` | `suites` | id, project_id (FK projects), name, cypress_path (nullable) | Cascades delete to sections. `cypress_path` stores the Cypress repo folder (e.g. `cypress/e2e/p1/common/`) as the canonical suite identifier |
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
| POST | `/api/auth/avatar` | Upload avatar image (multipart/form-data, max 5MB, magic-byte validated) |
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
| POST | `/api/projects/:pid/suites` | Create suite `{name, description, cypress_path?}` |
| GET | `/api/suites/:id` | Get suite |
| PUT | `/api/suites/:id` | Update suite (accepts `cypress_path`) |
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
- **Avatar upload** accepts JPEG, PNG, GIF, WebP, BMP, HEIC, AVIF, TIFF (max 5MB), validated by both file extension and magic bytes, stored in `uploads/avatars/` with UUID filename, served via `send_from_directory`
- **Email domain restriction** — only `@styleseat.com` emails can register or log in. Enforced at both registration (`is_allowed_email_domain()`) and login (post-authentication domain check). Uses OWASP-compliant generic error messages: registration returns "Unable to create account. Please contact your administrator." for both bad domain and duplicate user (same 403 status); login returns "Invalid username or password" for all failures. Constant `ALLOWED_EMAIL_DOMAIN` in `routes/auth.py`
- **Suite path derivation** in `app/suite_utils.py` — single source of truth replacing all hardcoded SUITE_MAP dictionaries. Three functions: `cypress_path_to_name()` (path→display name), `workflow_name_to_cypress_path()` (CircleCI job name→path), `determine_cypress_path()` (file path→suite path). Both `/cypress-sync` and `/circleci-import` import from this module. Suites are matched by `cypress_path` column, not by name

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

### Responsive Layout Rules

The app uses a **3-tier responsive breakpoint system**. Every new page or component MUST follow these rules:

**Breakpoints** (all `max-width`):
- **1024px** — Mid-range screens where the 270px sidebar is still visible (~750px content area)
- **768px** — Mobile: sidebar hidden, hamburger menu, single-column layouts
- **640px** — Small mobile: further simplification

**Critical CSS rules for flex/grid layouts:**
1. **Always add `min-width: 0`** on flex children that contain dynamic content — prevents flex items from overflowing their container (the default `min-width: auto` causes content to push past viewport). Already set on `.app-main` globally.
2. **Always add `overflow-x: hidden`** on content containers that should never scroll horizontally. Already set on `.app-main` globally.
3. **Never rely on fixed-width columns alone** — every row with fixed-width columns (`width: Npx; flex-shrink: 0`) must have a `@media (max-width: 1024px)` rule that either hides secondary columns or reduces their widths.

**1024px breakpoint checklist** (apply to every page):
- Reduce `page-content` padding (28px → 20px, handled globally in `index.css`)
- **Hide secondary data columns** (e.g., tested-by, meta, date) — keep only ID, title, and primary action column
- **Hide less important stat tiles** (e.g., pass rate tile)
- **Shrink remaining fixed columns** (90px → 70px for IDs, 120px → 100px for status)
- **Reduce gaps and padding** on rows, headers, and tiles
- **Stack page toolbars vertically** (`flex-direction: column`) so heading and buttons don't compete for horizontal space
- **Constrain floating bars** (bulk action bars) with `max-width: calc(100% - 32px)` and `flex-wrap: wrap`
- **Reduce tab padding** (22px → 14px) to prevent tab overflow
- **Stack form rows** (`flex-direction: column`) instead of side-by-side columns
- **Shrink grid columns** (4-col → 2-col for stat grids, 2-col grid → single column for overviews)

**768px breakpoint checklist** (mobile):
- All of the above, plus hide sidebar, show hamburger
- Hide all secondary columns (meta, tested-by, chevrons)
- Stat tiles: hide pass rate tile, reduce min-width to 70px
- Reduce section header padding, case row padding
- Stack all multi-column layouts to single column

**Pattern for data rows with columns:**
```css
/* Desktop */
.row { display: flex; align-items: center; gap: 16px; }
.row-id { flex-shrink: 0; width: 90px; }
.row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.row-secondary { flex-shrink: 0; width: 100px; }
.row-action { flex-shrink: 0; width: 120px; }

/* Mid-range: hide secondary, shrink others */
@media (max-width: 1024px) {
  .row { gap: 8px; }
  .row-id { width: 70px; }
  .row-secondary { display: none; }
  .row-action { width: 100px; }
}

/* Mobile: minimal */
@media (max-width: 768px) {
  .row-id { width: 70px; font-size: 12px; }
  .row-action { width: 90px; }
}
```

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
python seed.py          # Creates demo user + project
python sync_cypress.py  # Re-sync test cases from Cypress repo
python run.py           # Start server
```

**Add a new frontend service:**
1. Create `frontend/src/services/newService.js` following the pattern in existing services
2. Import and use in page components

## Launch Demo

When the user asks to "start demo" or "launch demo", run:

```bash
npm run demo
```

This script (`scripts/start-demo.sh`) performs:
1. Kills existing servers on ports 5001/5173
2. Seeds a fresh database via `seed.py` (creates demo user + Cypress Automation project)
3. Starts backend and frontend servers
4. Syncs test cases from Cypress repo in the background via `sync_cypress.py`

The app is usable immediately after step 3. Test cases populate progressively as the background sync processes each suite.

### Expected data after sync
| Entity | Count | Notes |
|--------|-------|-------|
| Users | 1 | `demo` / `Demo1234` (demo@styleseat.com) |
| Projects | 1 | Cypress Automation |
| Suites | ~12 | Auto-created from Cypress repo folder structure |
| Sections | ~500+ | Named from `describe()` blocks in Cypress files |
| Test Cases | ~2,500 | Extracted from Cypress `it()` blocks (count varies with repo) |
| Test Runs | 0 | Use `npm run import -- <url>` to import runs from CircleCI |

**Login:** `demo` / `Demo1234`
**URL:** http://localhost:5173

## Dependencies

### Python (backend/requirements.txt)
- Flask 3.1.0
- Flask-SQLAlchemy 3.1.1
- Flask-CORS 5.0.0
- Flask-JWT-Extended 4.7.1
- Werkzeug 3.1.3
- python-dotenv 1.2.2 — auto-loads `backend/.env` into environment variables

### Node (frontend/package.json)
- react 19.2, react-dom 19.2
- react-router-dom 7.13
- axios 1.13
- chart.js 4.5, react-chartjs-2 5.3
- vite 7.3 (dev)

## Environment Variables

Environment variables are configured via `backend/.env` (auto-loaded by `python-dotenv`). Copy from `backend/.env.example` on first setup.

| Variable | Used By | Required | Default | Description |
|----------|---------|:--------:|---------|-------------|
| `CIRCLECI_API_TOKEN` | `import_circleci.py` | **Yes** | — | CircleCI personal API token. Generate at [User Settings → Personal API Tokens](https://app.circleci.com/settings/user/tokens) |
| `CIRCLECI_PROJECT_SLUG` | `import_circleci.py` | No | `gh/styleseat/cypress` | CircleCI project slug (`gh/org/repo` format) |
| `JWT_SECRET_KEY` | `config.py` | No | Auto-generated | Secret key for JWT token signing |
| `TESTRAIL_BASE_URL` | `seed_testrail.py` | No | — | Only needed for legacy TestRail seeding |
| `TESTRAIL_EMAIL` | `seed_testrail.py` | No | — | Only needed for legacy TestRail seeding |
| `TESTRAIL_PASSWORD` | `seed_testrail.py` | No | — | Only needed for legacy TestRail seeding |
| `TESTRAIL_PROJECT_ID` | `seed_testrail.py` | No | — | Only needed for legacy TestRail seeding |
| `RETENTION_DAYS` | `app` | No | `30` | Number of days to retain data |

**How `.env` loading works:** `import_circleci.py` calls `load_dotenv(Path(__file__).parent / '.env')` before reading any environment variables. The `.env` file is gitignored so secrets are never committed.

**Note:** `sync_cypress.py` does not use environment variables — it authenticates via the GitHub CLI (`gh auth login`).

## Port Configuration
- Backend API: **5001** (macOS uses 5000 for AirTunes)
- Frontend dev server: **5173** (Vite default)
- CORS configured to allow `http://localhost:5173` and `http://127.0.0.1:5173`

## Upload Configuration
- **Avatar storage**: `backend/uploads/avatars/` (auto-created on app start)
- **Max file size**: 5MB (`MAX_CONTENT_LENGTH` in `config.py`)
- **Allowed formats**: JPEG, PNG, GIF, WebP, BMP, HEIC, HEIF, AVIF, TIFF
- **Validation**: Dual-layer — file extension check + magic byte header verification (rejects renamed non-image files)
- **Filename pattern**: `{uuid}.{ext}` (non-predictable UUIDs to prevent enumeration)

## Access Control
- **Email domain restriction**: Only `@styleseat.com` email addresses can register or log in
- **Registration enforcement**: `is_allowed_email_domain()` check combined with duplicate-user check under a single generic 403 response — "Unable to create account. Please contact your administrator." — to prevent both domain discovery and user enumeration (OWASP Authentication Cheat Sheet compliant)
- **Login enforcement**: Post-authentication domain check returns the same "Invalid username or password" 401 as a wrong password — indistinguishable to an attacker
- **Configuration**: `ALLOWED_EMAIL_DOMAIN` constant in `backend/app/routes/auth.py`
- **Filename pattern**: `{user_id}_{secure_filename}` to avoid collisions

## Test Data Workflow

The system uses a two-source approach for test management:

### Source of Truth

1. **Cypress Repo** (`styleseat/cypress`) → Test case definitions
   - **Requires:** GitHub CLI authenticated (`gh auth login`) with access to `styleseat/cypress`
   - All test cases are synced from the Cypress repo via `sync_cypress.py`
   - Test structure maps to suites: `cypress/e2e/p1/common/` → P1 Common
   - Use `npm run sync` or `/cypress-sync` to pull latest test definitions
   - Matches existing cases by TestRail ID (`C\d+` prefix) first, then exact title — prevents duplicates when titles change
   - Strips all leading C-ID prefixes (e.g., `C423016 C423079 Title` → `Title`) from stored titles
   - Removes orphaned test cases (deleted from repo) and empty sections on each sync
   - Safety guard: orphan cleanup skipped if >50% of file fetches fail (protects against API rate limits)
   - Excluded paths: `manual/`, `utility/`, `utility_lifecycle/`, `weekly/` (configured in `EXCLUDED_PATHS` in `sync_cypress.py`)

2. **CircleCI** → Test results
   - **Requires:** `CIRCLECI_API_TOKEN` in `backend/.env` (see [Environment Variables](#environment-variables))
   - Test run results are imported from CircleCI workflows
   - Use `npm run import -- <workflow-url>` or `/circleci-import <workflow-url>` to import results
   - Automatically creates test cases for new tests not yet synced
   - Token is auto-loaded from `backend/.env` via `python-dotenv` — no manual `export` needed

### Workflow

```bash
# 0. First time: set up backend/.env with your CircleCI token (see Environment Variables section)
cp backend/.env.example backend/.env   # then edit and fill in CIRCLECI_API_TOKEN

# 1. Start demo (seeds DB + starts servers + syncs Cypress tests in background)
npm run demo

# 2. (Optional) Manually sync latest test cases from Cypress repo
npm run sync

# 3. Import CircleCI results (requires CIRCLECI_API_TOKEN in backend/.env)
npm run import -- https://app.circleci.com/pipelines/github/styleseat/cypress/.../workflows/...
```

### Suite Mapping

Suite names are auto-derived from `cypress_path` by `backend/app/suite_utils.py`. The `cypress_path` column on the `Suite` model is the single source of truth — no hardcoded dictionaries. Both `/cypress-sync` and `/circleci-import` use `suite_utils` to derive paths and look up suites.

| Cypress Path (`cypress_path` column) | Demo Suite Name |
|---------------------------------------|------------------------|
| `cypress/e2e/abTest/` | ABTEST |
| `cypress/e2e/p1/api/` | API |
| `cypress/e2e/p3/` | Admin |
| `cypress/e2e/p1/client/` | Client |
| `cypress/e2e/p1/common/` | Common |
| `cypress/e2e/communications/` | Communications |
| `cypress/e2e/events/` | Events |
| `cypress/e2e/devices/p1/` | Devices |
| `cypress/e2e/p0/` | PO |
| `cypress/e2e/prod/` | PROD |
| `cypress/e2e/preprod/` | Pre Prod |
| `cypress/e2e/p1/pro/` | Pro |
| `cypress/e2e/p1/search/` | Search |

New suites are auto-created when a new Cypress folder or CircleCI workflow is encountered — no code changes needed.

### Test Matching (CircleCI → Cypress)

`/circleci-import` uses a three-tier matching strategy to pair CircleCI results with Cypress test definitions:

1. **Exact match** — normalized title (case-insensitive) direct lookup
2. **File-path + fuzzy match** — if exact fails, narrows CI candidates to the same source file, then tries substring containment (catches template-literal interpolation) and token overlap (Jaccard index ≥ 0.6, catches minor wording differences)
3. **Unmatched** — CI tests with no match go to "CircleCI Only" section; Cypress tests with no CI result are marked "Untested"

The fuzzy match report shows each match with its score so you can audit false positives.

Test title extraction supports: `it()`, `it.only()`, `it.skip()`, `itStage()` (staging-only wrapper), tag arrays (`it([Tag.X], "title")`), escaped quotes, and template literals.

### Handling Failed File Loads

When a Cypress test file fails to load (syntax error, import error, etc.):
1. CircleCI reports a synthetic "An uncaught error was detected outside of a test" failure
2. The `/circleci-import` detects this and marks all tests from that file as "Blocked"
3. The error message from CircleCI is attached to each blocked result

### Handling Failed CircleCI Jobs

When a CircleCI job fails entirely (crash, timeout, infrastructure failure) and produces no `report.json`:
1. The `/circleci-import` detects jobs with status `failed`/`error`/`infrastructure_fail`/`timedout` that have no report artifact
2. A warning is printed listing the failed jobs and count (e.g., "2/4 job(s) failed without results")
3. Cypress tests that would have run in those jobs appear as "Untested" with an error message noting the job failures
4. The test run description in the database includes the failed job names for visibility in the UI
