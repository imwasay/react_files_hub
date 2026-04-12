#!/usr/bin/env bash
set -euo pipefail

# deploy-storage.sh — rebuild and restart storage node stack
cd "$(dirname "$0")/.."

echo "Pulling latest and rebuilding..."
docker compose -f docker-compose.storage.yml pull
docker compose -f docker-compose.storage.yml build --no-cache
docker compose -f docker-compose.storage.yml up -d

echo "Reloading NGINX..."
sudo nginx -t && sudo systemctl reload nginx

echo "Done. Storage node redeployed."
