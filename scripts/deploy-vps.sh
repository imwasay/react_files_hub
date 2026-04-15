#!/usr/bin/env bash
set -euo pipefail

# deploy-vps.sh — push React build and restart edge service on Oracle VPS
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

VPS_USER="${VPS_USER:-ubuntu}"
VPS_HOST="${VPS_HOST:-wg.ntrides.com.au}"
VPS_SSH_KEY="${VPS_SSH_KEY:-}"
VPS_SSH_PORT="${VPS_SSH_PORT:-22}"
VPS_REACT_PATH="${VPS_REACT_PATH:-/home/${VPS_USER}/files_hub-react}"
VPS_EDGE_PATH="${VPS_EDGE_PATH:-/home/${VPS_USER}/files_hub-edge}"

# Build SSH/rsync options
SSH_OPTS="-p ${VPS_SSH_PORT}"
if [ -n "${VPS_SSH_KEY}" ]; then
  SSH_OPTS="${SSH_OPTS} -i ${VPS_SSH_KEY}"
fi
SSH_CMD="ssh ${SSH_OPTS}"
RSYNC_SSH_CMD="ssh ${SSH_OPTS}"

echo "Building frontend..."
cd frontend && npm ci && npm run build && cd ..

echo "Syncing React build to VPS..."
rsync -avz --delete -e "${RSYNC_SSH_CMD}" frontend/dist/ "${VPS_USER}@${VPS_HOST}:${VPS_REACT_PATH}/"

echo "Syncing edge service (nginx_others/)..."
rsync -avz -e "${RSYNC_SSH_CMD}" nginx_others/ "${VPS_USER}@${VPS_HOST}:${VPS_EDGE_PATH}/"

echo "Restarting edge service on VPS..."
${SSH_CMD} "${VPS_USER}@${VPS_HOST}" "
  cd ${VPS_EDGE_PATH}
  [ -d venv ] && source venv/bin/activate
  pip install -r requirements.txt -q 2>/dev/null || true
  sudo systemctl restart files_hub-edge
  sudo nginx -t && sudo systemctl reload nginx
"

echo "Done. VPS edge redeployed."
