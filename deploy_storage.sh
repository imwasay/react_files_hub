#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

if [ "$1" == "--help" ]; then
    echo -e "${YELLOW}deploy_storage.sh — Sets up prod environment and starts a Storage Node${NC}"
    echo "Usage: ./deploy_storage.sh"
    exit 0
fi

if [ -f "./docker-compose.yml" ] && [ -f "./.env" ]; then
    echo -e "${GREEN}Found existing configuration. Starting less go mode...${NC}"
    docker compose pull && docker compose up -d
    echo -e "${GREEN}Storage Node started!${NC}"
    exit 0
fi

echo -e "${YELLOW}Missing config. Starting setup wizard...${NC}"

read -p "Enter NODE_ID (e.g. node_alice_storage): " NODE_ID
read -p "Enter SELF_ADDRESSES: " SELF_ADDRESSES
echo -e "${YELLOW}You must use the same MESH_JWT_SECRET and NODE_FEDERATION_SECRET as the directory node.${NC}"
read -p "Enter MESH_JWT_SECRET: " MESH_JWT_SECRET
read -p "Enter NODE_FEDERATION_SECRET: " NODE_FEDERATION_SECRET
read -p "Enter DIRECTORY_NODE_ADDRESSES (comma-separated): " DIRECTORY_NODE_ADDRESSES
read -p "Enter WATCH_DIRS (comma-separated local paths to share, e.g. /mnt/movies,/home/alice/docs): " WATCH_DIRS
read -p "Enter HOST_PORT (default: 8001): " HOST_PORT
HOST_PORT=${HOST_PORT:-8001}

cat <<EOF > .env
NODE_MODE=storage
NODE_ID=${NODE_ID}
SELF_ADDRESSES=${SELF_ADDRESSES}
MESH_JWT_SECRET=${MESH_JWT_SECRET}
NODE_FEDERATION_SECRET=${NODE_FEDERATION_SECRET}
DIRECTORY_NODE_ADDRESSES=${DIRECTORY_NODE_ADDRESSES}
EOF

VOLUMES_YAML="      - ./data:/app/data"
IFS=',' read -ra DIRS <<< "$WATCH_DIRS"
for dir in "${DIRS[@]}"; do
    VOLUMES_YAML+=$'\n'"      - ${dir}:${dir}:ro"
done

cat <<EOF > docker-compose.yml
services:
  backend:
    image: wasayabdul51/react-files-storage:latest
    env_file: .env
    volumes:
$VOLUMES_YAML
    ports:
      - "${HOST_PORT}:8000"
    restart: unless-stopped
EOF

echo -e "${GREEN}Configuration saved. Pulling and starting...${NC}"
docker compose pull && docker compose up -d
echo -e "${GREEN}Storage Node started!${NC}"
