#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== StyleSeat Guardian Deploy ==="

# 1. Kill existing backend & tunnel
echo "Stopping existing backend and tunnel..."
lsof -ti:5001 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1

# 2. Backup database before anything else
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

# 3. Start backend
echo "Starting backend..."
python seed.py
python run.py &
BACKEND_PID=$!

# Wait for backend
for i in $(seq 1 10); do
  curl -s http://localhost:5001/api/auth/login > /dev/null 2>&1 && break
  sleep 1
done
echo "Backend running on http://localhost:5001"

# 3. Start Cloudflare tunnel and capture URL
echo "Starting Cloudflare tunnel..."
TUNNEL_LOG=$(mktemp)
cloudflared tunnel --url http://localhost:5001 2>"$TUNNEL_LOG" &
TUNNEL_PID=$!

# Wait for tunnel URL
TUNNEL_URL=""
for i in $(seq 1 15); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done
rm -f "$TUNNEL_LOG"

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: Failed to get tunnel URL"
  kill $BACKEND_PID $TUNNEL_PID 2>/dev/null
  exit 1
fi
echo "Tunnel running at $TUNNEL_URL"

# 4. Update frontend API URL and build
echo "Building frontend with API URL: $TUNNEL_URL/api"
echo "VITE_API_URL=$TUNNEL_URL/api" > "$ROOT_DIR/frontend/.env.production"

cd "$ROOT_DIR/frontend"
npm run build

# 5. Deploy to Cloudflare Pages
echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name styleseat-guardian --commit-dirty=true

echo ""
echo "=== Deploy Complete ==="
echo "  Frontend: https://master.styleseat-guardian.pages.dev"
echo "  Backend:  $TUNNEL_URL"
echo "  Login:    demo / Demo1234"
echo ""
echo "Backend and tunnel running in background (PIDs: $BACKEND_PID, $TUNNEL_PID)"
echo "Press Ctrl+C to stop, or run: kill $BACKEND_PID $TUNNEL_PID"

trap "kill $BACKEND_PID $TUNNEL_PID 2>/dev/null; exit" INT TERM
wait