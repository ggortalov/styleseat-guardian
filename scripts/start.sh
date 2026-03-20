#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== StyleSeat Guardian ==="

# 1. Kill existing servers
echo "Stopping existing servers..."
lsof -ti:5001 -ti:5173 -ti:5174 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# 2. Auto-migrate: ensure current schema matches models
echo "Checking schema migrations..."
cd "$ROOT_DIR/backend"
python3 -c "
import sqlite3, sys
conn = sqlite3.connect('app.db')
c = conn.cursor()

migrations = [
    ('test_runs', 'run_date', 'DATETIME'),
    ('test_results', 'error_message', 'TEXT'),
    ('test_results', 'artifacts', 'TEXT'),
    ('test_results', 'circleci_job_id', 'VARCHAR(100)'),
    ('result_history', 'error_message', 'TEXT'),
    ('result_history', 'artifacts', 'TEXT'),
    ('test_cases', 'suite_id', 'INTEGER REFERENCES suites(id)'),
    ('test_cases', 'created_by', 'INTEGER REFERENCES users(id)'),
    ('test_cases', 'updated_by', 'INTEGER REFERENCES users(id)'),
    ('test_cases', 'updated_at', 'DATETIME'),
]

applied = 0
for table, col, col_type in migrations:
    cols = [r[1] for r in c.execute(f'PRAGMA table_info({table})').fetchall()]
    if col not in cols:
        c.execute(f'ALTER TABLE {table} ADD COLUMN {col} {col_type}')
        applied += 1

conn.commit()
conn.close()
if applied:
    print(f'  Applied {applied} migration(s)')
else:
    print('  Schema up to date')
"

# 3. Start backend
echo "Starting backend on http://localhost:5001 ..."
source venv/bin/activate
python run.py &
BACKEND_PID=$!

# 4. Start frontend
echo "Starting frontend on http://localhost:5173 ..."
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

# 5. Wait for backend to be ready
echo "Waiting for servers..."
for i in $(seq 1 15); do
  if curl -s http://localhost:5001/api/auth/login > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# 6. Sync test cases from Cypress repo
echo "Syncing test cases from Cypress repo..."
cd "$ROOT_DIR/backend"
python sync_cypress.py

echo ""
echo "=== Guardian Ready ==="
echo "  URL:   http://localhost:5173"
echo "  Login: demo / Demo1234"
echo ""
echo "Press Ctrl+C to stop both servers."

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait