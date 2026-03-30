#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SEED_DATA="$ROOT_DIR/backend/seed_data.json"

echo "=== StyleSeat Guardian Demo ==="

# 1. Kill existing servers
echo "Stopping existing servers..."
lsof -ti:5001 -ti:5173 -ti:5174 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# 2. Backup database if it exists
cd "$ROOT_DIR/backend"
source venv/bin/activate

if [ -f app.db ]; then
  BACKUP_DIR="$ROOT_DIR/backend/backups"
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/app_$(date +%Y%m%d_%H%M%S).db"
  cp app.db "$BACKUP_FILE"
  echo "Database backed up to $BACKUP_FILE"
  # Keep only last 5 backups
  ls -t "$BACKUP_DIR"/app_*.db 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
fi

# 3. Ensure database exists (preserves existing accounts)

if [ -f app.db ]; then
  echo "Existing database found — preserving all accounts."
  python seed.py
else
  echo "No database found — creating fresh database..."
  if [ -f "$SEED_DATA" ]; then
    echo "Restoring database from seed snapshot..."
    python restore_db.py "$SEED_DATA"
  else
    python seed.py
    echo ""
    echo "  NOTE: Run 'npm run sync' to populate test cases from Cypress repo."
  fi
fi

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

echo ""
echo "=== Demo Ready ==="
echo "  URL:   http://localhost:5173"
echo "  Login: demo / Demo1234"
echo ""
echo "Press Ctrl+C to stop all processes."

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
