#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

if [ "$1" == "--help" ]; then
    echo -e "${YELLOW}deploy_node.sh — Sets up prod environment and starts a React Files Hub Node${NC}"
    echo "Usage: ./deploy_node.sh"
    exit 0
fi

if [ -f "./docker-compose.yml" ] && [ -f "./.env" ]; then
    echo -e "${GREEN}Found existing configuration. Starting less go mode...${NC}"
    if [ -f "Dockerfile" ]; then
        docker compose up -d --build
    else
        docker compose up -d
    fi
    echo -e "${GREEN}Node started!${NC}"
    exit 0
fi

echo -e "${YELLOW}Missing config. Starting setup wizard...${NC}"

read -p "Enter NODE_ID (e.g. node_king_directory): " NODE_ID < /dev/tty
read -p "Enter NODE_IP (comma-separated, e.g. 192.168.1.10:8000,mydir.duckdns.org:8000): " NODE_IP < /dev/tty
read -p "Enter PEER_NODES (e.g. hassan=alphaservers.dns.army:8000;): " PEER_NODES < /dev/tty

echo -e "${YELLOW}Suggestion for secrets: run 'openssl rand -hex 32' in another terminal and paste the result.${NC}"
read -p "Enter JWT_SECRET: " JWT_SECRET < /dev/tty
read -p "Enter FEDERATION_TOKEN: " FEDERATION_TOKEN < /dev/tty
read -p "Enter ADMIN_USERNAME: " ADMIN_USERNAME < /dev/tty
read -p "Enter ADMIN_EMAIL: " ADMIN_EMAIL < /dev/tty
read -p "Enter ADMIN_PASSWORD: " ADMIN_PASSWORD < /dev/tty
read -p "Enter STORAGE_ROOTS (comma-separated absolute paths, e.g. /mnt/movies,/mnt/documents): " STORAGE_ROOTS < /dev/tty
read -p "Enter DB_PATH (default: ./data/registry.db): " DB_PATH < /dev/tty
DB_PATH=${DB_PATH:-/data/registry.db}
read -p "Enter HOST_PORT (default: 8000): " HOST_PORT < /dev/tty
HOST_PORT=${HOST_PORT:-8000}


cat <<EOF > .env
NODE_ID=${NODE_ID}
SELF_NODE_ID=${NODE_ID}
NODE_IP=${NODE_IP}
PEER_NODES=${PEER_NODES}
JWT_SECRET=${JWT_SECRET}
FEDERATION_TOKEN=${FEDERATION_TOKEN}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
DB_PATH=${DB_PATH}
STORAGE_ROOTS=${STORAGE_ROOTS}
EOF

# Build volume mounts block
VOLUME_MOUNTS="      - ./data:/data
      - /etc/letsencrypt:/certs:ro"

IFS=',' read -ra ADDR <<< "$STORAGE_ROOTS"
for path in "${ADDR[@]}"; do
    if [ -n "$path" ]; then
        VOLUME_MOUNTS="${VOLUME_MOUNTS}
      - ${path}:${path}:ro"
    fi
done

if [ -f "Dockerfile" ]; then
    IMAGE_BLOCK="    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_FALLBACK_NODE_URLS: \"https://alphaservers.dns.army\""
else
    IMAGE_BLOCK="    image: wasayabdul51/react-files-hub:latest"
fi

cat <<EOF > docker-compose.yml
services:
  backend:
${IMAGE_BLOCK}
    env_file: .env
    volumes:
${VOLUME_MOUNTS}
    network_mode: "host"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${HOST_PORT}/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
EOF

echo -e "${GREEN}Configuration saved. Building and starting...${NC}"
if [ -f "Dockerfile" ]; then
    docker compose up -d --build
else
    docker compose up -d
fi
echo -e "${GREEN}Node started successfully!${NC}"
