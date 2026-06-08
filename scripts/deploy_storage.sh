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
read -p "Enter NODE_IP: " NODE_IP
echo -e "${YELLOW}You must use the same JWT_SECRET and NODE_FEDERATION_SECRET as the directory node.${NC}"
read -p "Enter JWT_SECRET: " JWT_SECRET
read -p "Enter NODE_FEDERATION_SECRET: " NODE_FEDERATION_SECRET
read -p "Enter DIR_NODE_IP (comma-separated): " DIR_NODE_IP
read -p "Enter MAPPED_ROOTS (comma-separated local paths to share, e.g. /mnt/movies,/home/alice/docs): " MAPPED_ROOTS
read -p "Enter HOST_PORT (default: 8000): " HOST_PORT
HOST_PORT=${HOST_PORT:-8000}

cat <<EOF > .env
NODE_MODE=storage
NODE_ID=${NODE_ID}
SELF_NODE_ID=${NODE_ID}
NODE_IP=${NODE_IP}
JWT_SECRET=${JWT_SECRET}
NODE_FEDERATION_SECRET=${NODE_FEDERATION_SECRET}
DIR_NODE_IP=${DIR_NODE_IP}
MAPPED_ROOTS=${MAPPED_ROOTS}
EOF

VOLUMES_YAML="      - ./data:/data"
IFS=',' read -ra DIRS <<< "$MAPPED_ROOTS"
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
      - "127.0.0.1:${HOST_PORT}:8000"
    restart: unless-stopped
EOF

echo -e "${GREEN}Configuration saved. Pulling and starting...${NC}"
docker compose pull && docker compose up -d
echo -e "${GREEN}Storage Node started!${NC}"
