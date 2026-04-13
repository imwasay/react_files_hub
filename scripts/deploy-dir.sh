#!/usr/bin/env bash
set -euo pipefail

# deploy-dir.sh — rebuild and restart directory node stack
cd "$(dirname "$0")/.."

echo "Building frontend..."
cd frontend && npm ci && npm run build && cd ..

echo "Copying React build to NGINX root..."
sudo cp -r frontend/dist/* /var/www/files_hub/

echo "Pulling latest and rebuilding backend..."
docker compose -f docker-compose.directory.yml pull
docker compose -f docker-compose.directory.yml build 
docker compose -f docker-compose.directory.yml up -d

echo "Reloading NGINX..."
sudo nginx -t && sudo systemctl reload nginx
sudo cp nginx_others/directory.conf /etc/nginx/sites-available/files_directory_node.conf

echo "Done. Directory node redeployed."
