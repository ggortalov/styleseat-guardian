#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== StyleSeat Guardian Demo ==="

# 1. Kill existing servers
echo "Stopping existing servers..."
lsof -ti:5001 -ti:5173 -ti:5174 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# 2. Fresh database from seed (creates demo user + Cypress Automation project)
echo "Resetting database..."
cd "$ROOT_DIR/backend"
source venv/bin/activate
rm -f app.db
python seed.py

# 3. Start backend
echo "Starting backend on http://localhost:5001 ..."
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

# 6. Sync test cases from Cypress repo (background — app is usable immediately)
echo "Syncing test cases from Cypress repo (background)..."
cd "$ROOT_DIR/backend"
python sync_cypress.py &
SYNC_PID=$!

echo ""
echo "=== Demo Ready ==="
echo "  URL:   http://localhost:5173"
echo "  Login: demo / Demo1234"
echo ""
echo "  Cypress sync is running in the background."
echo "  Test cases will appear as suites are processed."
echo ""
echo "Press Ctrl+C to stop all processes."

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID $SYNC_PID 2>/dev/null; exit" INT TERM
wait