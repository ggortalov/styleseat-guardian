<div align="center">

# StyleSeat Guardian

**StyleSeat's Internal Test Management Platform**

![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.1-000000?style=for-the-badge&logo=flask&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-4.5-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)

---

Built to support the QA workflows and quality standards of the StyleSeat engineering team.
Guardian provides a centralized hub for organizing test suites, authoring test cases, executing test runs, and tracking results — all tailored to how StyleSeat ships software.

</div>

<br/>

## Quick Start

```bash
# Launch the full demo (resets DB, syncs Cypress tests, starts both servers)
npm run demo

# Login: demo / Demo1234
# URL:   http://localhost:5173
```

### Manual Setup

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
```

## NPM Scripts

Run from the project root:

| Script | Command | Description |
|--------|---------|-------------|
| `npm run demo` | `bash scripts/start-demo.sh` | Reset DB, sync Cypress tests, start both servers |
| `npm run sync` | `python sync_cypress.py` | Sync test cases from the Cypress repo |
| `npm run import -- <url>` | `python import_circleci.py` | Import test results from a CircleCI workflow |

## Features

<table>
  <tr>
    <td><strong>Project Management</strong></td>
    <td>Organize testing efforts across StyleSeat projects and initiatives</td>
  </tr>
  <tr>
    <td><strong>Test Suites & Sections</strong></td>
    <td>Structure test cases into suites with a hierarchical section tree that mirrors product areas</td>
  </tr>
  <tr>
    <td><strong>Test Cases</strong></td>
    <td>Author cases with type, priority, preconditions, and step-by-step instructions for consistent coverage across the team</td>
  </tr>
  <tr>
    <td><strong>Test Runs & Execution</strong></td>
    <td>Launch runs from suites, execute cases one by one with status tracking — <code>Passed</code> <code>Failed</code> <code>Blocked</code> <code>Retest</code> <code>Untested</code></td>
  </tr>
  <tr>
    <td><strong>Cypress Repo Sync</strong></td>
    <td>Automatically sync test definitions from the <code>styleseat/cypress</code> repo — suites, sections, and test cases extracted from <code>describe()</code> and <code>it()</code> blocks</td>
  </tr>
  <tr>
    <td><strong>CircleCI Import</strong></td>
    <td>Import test run results from CircleCI workflows with automatic test matching (exact, file-path fuzzy, and token overlap)</td>
  </tr>
  <tr>
    <td><strong>Dashboard & Charts</strong></td>
    <td>Global and per-project dashboards with doughnut charts for real-time quality visibility</td>
  </tr>
  <tr>
    <td><strong>Authentication</strong></td>
    <td>JWT-based auth with registration, login, avatar upload, and <code>@styleseat.com</code> email restriction</td>
  </tr>
  <tr>
    <td><strong>Responsive Design</strong></td>
    <td>Collapsible sidebar, mobile hamburger menu, DM Sans typography, animated UI with 3-tier breakpoint system</td>
  </tr>
</table>

## Test Data Workflow

Guardian uses a **two-source approach** for test management:

```
┌──────────────────┐         ┌──────────────────┐
│   Cypress Repo   │         │    CircleCI      │
│  (test definitions)│       │  (test results)  │
└────────┬─────────┘         └────────┬─────────┘
         │  npm run sync              │  npm run import -- <url>
         ▼                            ▼
┌─────────────────────────────────────────────────┐
│              StyleSeat Guardian                  │
│  Suites → Sections → Test Cases → Test Runs     │
└─────────────────────────────────────────────────┘
```

### Sync from Cypress Repo

```bash
npm run sync
```

- Fetches all `.cy.js` files from `styleseat/cypress` via GitHub API
- Extracts test titles from `it()`, `it.only()`, `it.skip()`, `itStage()`, and tag arrays
- Section names derived from `describe()` block titles
- Matches existing cases by TestRail ID (`C\d+` prefix) or exact title to avoid duplicates
- Automatically creates new suites for new Cypress directories
- Excluded paths: `manual/`, `utility/`, `utility_lifecycle/`, `weekly/`

### Import from CircleCI

```bash
npm run import -- https://app.circleci.com/pipelines/github/styleseat/cypress/.../workflows/...
```

- Fetches job artifacts and test reports from a CircleCI workflow
- Three-tier matching: exact title → file-path + fuzzy → unmatched (CircleCI Only section)
- Handles failed file loads (marks tests as Blocked) and failed jobs (marks as Untested)

## Architecture

```
regression-guard/
├── backend/                    # Flask REST API (Python 3.13, port 5001)
│   ├── app/
│   │   ├── __init__.py         # App factory
│   │   ├── models.py           # 8 SQLAlchemy models
│   │   ├── suite_utils.py      # Cypress path ↔ suite name mappings
│   │   └── routes/             # 7 Blueprints (auth, projects, suites, sections, test_cases, test_runs, dashboard)
│   ├── sync_cypress.py         # CLI: sync test cases from Cypress repo
│   ├── import_circleci.py      # CLI: import results from CircleCI workflows
│   ├── seed.py                 # Generate demo data from scratch
│   ├── run.py                  # Entry point (port 5001)
│   ├── app.db                  # SQLite database (auto-created)
│   └── app.db.demo             # Demo snapshot (restored by npm run demo)
│
├── frontend/                   # React 19 SPA (Vite, port 5173)
│   └── src/
│       ├── pages/              # 8 page components
│       ├── components/         # Shared UI (Sidebar, Header, Modal, StatusBadge, etc.)
│       ├── services/           # Axios API service layer
│       ├── context/            # Auth context (JWT + user state)
│       └── styles/             # CSS variables and design tokens
│
├── scripts/
│   └── start-demo.sh           # Demo launcher (reset DB + sync + start servers)
│
├── package.json                # NPM scripts: demo, sync, import
└── CLAUDE.md                   # Detailed architecture docs for AI assistants
```

## Tech Stack

<table>
  <tr>
    <th>Layer</th>
    <th>Technology</th>
  </tr>
  <tr>
    <td><strong>Frontend</strong></td>
    <td>
      <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React" />
      <img src="https://img.shields.io/badge/React_Router-7.13-CA4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router" />
      <img src="https://img.shields.io/badge/Axios-1.13-5A29E4?style=flat-square&logo=axios&logoColor=white" alt="Axios" />
      <img src="https://img.shields.io/badge/Chart.js-4.5-FF6384?style=flat-square&logo=chartdotjs&logoColor=white" alt="Chart.js" />
      <img src="https://img.shields.io/badge/Vite-7.3-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
    </td>
  </tr>
  <tr>
    <td><strong>Backend</strong></td>
    <td>
      <img src="https://img.shields.io/badge/Flask-3.1-000000?style=flat-square&logo=flask&logoColor=white" alt="Flask" />
      <img src="https://img.shields.io/badge/SQLAlchemy-3.1-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white" alt="SQLAlchemy" />
      <img src="https://img.shields.io/badge/JWT_Extended-4.7-000000?style=flat-square&logo=jsonwebtokens&logoColor=white" alt="JWT" />
    </td>
  </tr>
  <tr>
    <td><strong>Database</strong></td>
    <td>
      <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
    </td>
  </tr>
</table>

## Demo Credentials

| User | Password | Email |
|------|----------|-------|
| `demo` | `Demo1234` | demo@styleseat.com |

## Ports

| Service | Port |
|---------|------|
| Backend API | 5001 |
| Frontend dev server | 5173 |

---

<div align="center">

<sub>Internal StyleSeat project — not for external distribution.</sub>

</div>