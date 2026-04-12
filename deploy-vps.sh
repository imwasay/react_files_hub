#!/usr/bin/env bash
set -euo pipefail

# deploy-vps.sh — push React build and restart edge service
VPS_USER="ubuntu"
VPS_HOST="your-oracle-vps-ip"
VPS_REACT_PATH="/var/www/ntrides"
VPS_EDGE_PATH="/opt/ntrides-edge"

cd "$(dirname "$0")/.."

echo "Building frontend..."
cd frontend && npm ci && npm run build && cd ..

echo "Syncing React build to VPS..."
rsync -avz --delete frontend/dist/ "${VPS_USER}@${VPS_HOST}:${VPS_REACT_PATH}/"

echo "Syncing edge service..."
rsync -avz edge/ "${VPS_USER}@${VPS_HOST}:${VPS_EDGE_PATH}/"

echo "Restarting edge service..."
ssh "${VPS_USER}@${VPS_HOST}" "
  cd ${VPS_EDGE_PATH}
  source venv/bin/activate
  pip install -r requirements.txt -q
  sudo systemctl restart ntrides-edge
  sudo nginx -t && sudo systemctl reload nginx
"

echo "Done. VPS edge redeployed."
