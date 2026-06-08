#!/usr/bin/env bash
set -euo pipefail

# deploy-vps.sh — push React build + edge service to VPS
# Reads VPS connection settings from .env or uses defaults.
# Usage: bash scripts/deploy-vps.sh

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

VPS_USER="${VPS_USER:-ubuntu}"
VPS_HOST="${VPS_HOST:-your-vps-host}"
VPS_SSH_KEY="${VPS_SSH_KEY:-}"
VPS_SSH_PORT="${VPS_SSH_PORT:-22}"
VPS_REACT_PATH="${VPS_REACT_PATH:-/home/${VPS_USER}/files_hub-react}"
VPS_EDGE_PATH="${VPS_EDGE_PATH:-/home/${VPS_USER}/files_hub-edge}"

# Build SSH/rsync options
SSH_OPTS="-p ${VPS_SSH_PORT} -o StrictHostKeyChecking=no"
if [ -n "${VPS_SSH_KEY}" ]; then
  SSH_OPTS="${SSH_OPTS} -i ${VPS_SSH_KEY}"
fi
SSH_CMD="ssh ${SSH_OPTS}"

echo "═══════════════════════════════════════════════"
echo " Files Hub VPS Edge Deploy"
echo " Target: ${VPS_USER}@${VPS_HOST}:${VPS_SSH_PORT}"
echo "═══════════════════════════════════════════════"

# ── Step 1: Build frontend ──────────────────────────────────────────────────
echo ""
echo "[1/4] Building frontend..."
cd frontend && npm ci --silent && npm run build && cd ..

# ── Step 2: Sync React build ────────────────────────────────────────────────
echo "[2/4] Syncing React build to VPS..."
rsync -avz --delete -e "ssh ${SSH_OPTS}" frontend/dist/ "${VPS_USER}@${VPS_HOST}:${VPS_REACT_PATH}/"

# ── Step 3: Sync edge service ───────────────────────────────────────────────
echo "[3/4] Syncing edge service files..."
rsync -avz -e "ssh ${SSH_OPTS}" \
  nginx_others/vps_main.py \
  nginx_others/vps.conf \
  nginx_others/files-edge.service \
  nginx_others/example.env \
  "${VPS_USER}@${VPS_HOST}:${VPS_EDGE_PATH}/"

# ── Step 4: Restart services ───────────────────────────────────────────────
echo "[4/4] Restarting edge service on VPS..."
${SSH_CMD} "${VPS_USER}@${VPS_HOST}" "
  cd ${VPS_EDGE_PATH}

  # Setup venv if first run
  if [ ! -d venv ]; then
    python3 -m venv venv
  fi
  source venv/bin/activate

  pip install fastapi uvicorn httpx pydantic-settings -q 2>/dev/null || true

  # Copy env if missing
  if [ ! -f .env ]; then
    cp example.env .env
    echo '⚠ Created .env from example — edit DIR_NODE_IP before running!'
  fi

  # Install/reload systemd service
  sudo cp files-edge.service /etc/systemd/system/files_hub-edge.service
  sudo systemctl daemon-reload
  sudo systemctl enable files_hub-edge
  sudo systemctl restart files_hub-edge

  # Reload nginx if config exists
  if [ -f vps.conf ]; then
    sudo cp vps.conf /etc/nginx/sites-available/files_hub.conf
    sudo ln -sf /etc/nginx/sites-available/files_hub.conf /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
  fi
"

echo ""
echo "✓ VPS edge deployed successfully."
echo "  React UI:    https://${VPS_HOST}/"
echo "  Edge API:    http://127.0.0.1:8080 (VPS local)"
echo "  Edge health: https://${VPS_HOST}/api/v1/health"
