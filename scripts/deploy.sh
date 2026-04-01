#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_START=$(date +%s)

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      StyleSeat Guardian — Deploy         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── 1. Stop existing processes ───
echo "① Stopping existing backend and tunnel..."
lsof -ti:5001 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1
echo "   ✓ Processes stopped"

# ─── 2. Backend setup ───
echo ""
echo "② Preparing backend..."
cd "$ROOT_DIR/backend"
source venv/bin/activate

# Install/update Python dependencies
pip install -q -r requirements.txt

# ─── 3. Backup database ───
if [ -f app.db ]; then
  echo ""
  echo "③ Backing up database..."
  BACKUP_DIR="$ROOT_DIR/backend/backups"
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/app_$(date +%Y%m%d_%H%M%S).db"
  cp app.db "$BACKUP_FILE"
  echo "   ✓ Binary backup: $BACKUP_FILE"

  # Keep only last 5 binary backups
  ls -t "$BACKUP_DIR"/app_*.db 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true

  # Export to seed_data.json so data survives a full DB reset
  python backup_db.py
  echo "   ✓ JSON export: seed_data.json"
else
  echo ""
  echo "③ No existing database — will create fresh"
fi

# ─── 4. Seed database (ensures team accounts) ───
echo ""
echo "④ Seeding database..."
python seed.py

# ─── 5. Start backend ───
echo ""
echo "⑤ Starting backend..."
python run.py &
BACKEND_PID=$!

for i in $(seq 1 15); do
  if curl -s http://localhost:5001/api/auth/login > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
echo "   ✓ Backend running on http://localhost:5001 (PID: $BACKEND_PID)"

# ─── 6. Start Cloudflare tunnel ───
echo ""
echo "⑥ Starting Cloudflare tunnel..."
TUNNEL_LOG=$(mktemp)
cloudflared tunnel --url http://localhost:5001 2>"$TUNNEL_LOG" &
TUNNEL_PID=$!

TUNNEL_URL=""
for i in $(seq 1 20); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done
rm -f "$TUNNEL_LOG"

if [ -z "$TUNNEL_URL" ]; then
  echo "   ✗ ERROR: Failed to get tunnel URL after 20s"
  kill $BACKEND_PID $TUNNEL_PID 2>/dev/null
  exit 1
fi
echo "   ✓ Tunnel: $TUNNEL_URL"

# ─── 7. Install frontend dependencies ───
echo ""
echo "⑦ Preparing frontend..."
cd "$ROOT_DIR/frontend"
npm install --silent

# ─── 8. Build frontend ───
echo ""
echo "⑧ Building frontend (API → $TUNNEL_URL/api)..."
echo "VITE_API_URL=$TUNNEL_URL/api" > .env.production
npm run build

# ─── 9. Deploy to Cloudflare Pages ───
echo ""
echo "⑨ Deploying to Cloudflare Pages..."
DEPLOY_OUTPUT=$(npx wrangler pages deploy dist --project-name styleseat-guardian --commit-dirty=true 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract the deployment URL from wrangler output
PAGES_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[a-z0-9-]*\.styleseat-guardian\.pages\.dev' | head -1)
if [ -z "$PAGES_URL" ]; then
  PAGES_URL="https://styleseat-guardian.pages.dev"
fi

# ─── 10. Sync Cypress tests in background ───
echo ""
echo "⑩ Syncing Cypress tests (background)..."
cd "$ROOT_DIR/backend"
python sync_cypress.py > /dev/null 2>&1 &
SYNC_PID=$!
echo "   ✓ Sync started (PID: $SYNC_PID)"

# ─── Done ───
DEPLOY_END=$(date +%s)
DEPLOY_DURATION=$((DEPLOY_END - DEPLOY_START))

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         Deploy Complete                  ║"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "   Frontend:  $PAGES_URL"
echo "   Backend:   $TUNNEL_URL"
echo "   API:       $TUNNEL_URL/api"
echo "║                                          ║"
echo "   Duration:  ${DEPLOY_DURATION}s"
echo "║                                          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Backend PID: $BACKEND_PID | Tunnel PID: $TUNNEL_PID"
echo "Press Ctrl+C to stop, or run: kill $BACKEND_PID $TUNNEL_PID"
echo ""

trap "kill $BACKEND_PID $TUNNEL_PID 2>/dev/null; exit" INT TERM
wait
