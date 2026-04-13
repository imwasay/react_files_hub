#!/usr/bin/env bash
set -euo pipefail

# deploy-vps.sh — push React build and restart edge service
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

SSH_CMD="ssh"
RSYNC_SSH="ssh"
if [ -n "${VPS_SSH_KEY}" ]; then
  SSH_CMD="ssh -i ${VPS_SSH_KEY}"
  RSYNC_SSH="ssh -i ${VPS_SSH_KEY}"
fi
if [ -n "${VPS_SSH_PORT}" ]; then
  SSH_CMD="${SSH_CMD} -p ${VPS_SSH_PORT}"
  RSYNC_SSH="${RSYNC_SSH} -p ${VPS_SSH_PORT}"
fi

echo "Building frontend..."
cd frontend && npm ci && npm run build && cd ..

echo "Syncing React build to VPS..."
rsync -avz -e "${RSYNC_SSH}" --delete frontend/dist/ "${VPS_USER}@${VPS_HOST}:${VPS_REACT_PATH}/"

echo "Syncing edge service..."
rsync -avz -e "${RSYNC_SSH}" edge/ "${VPS_USER}@${VPS_HOST}:${VPS_EDGE_PATH}/"

echo "Restarting edge service..."
${SSH_CMD} "${VPS_USER}@${VPS_HOST}" "
  cd ${VPS_EDGE_PATH}
  source venv/bin/activate
  pip install -r requirements.txt -q
  sudo systemctl restart files_hub-edge
  sudo nginx -t && sudo systemctl reload nginx
"

echo "Done. VPS edge redeployed."
