#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

if [ "$1" == "--help" ]; then
    echo -e "${YELLOW}deploy_dir.sh — Sets up prod environment and starts the Directory Node${NC}"
    echo "Usage: ./deploy_dir.sh"
    exit 0
fi

if [ -f "./docker-compose.yml" ] && [ -f "./.env" ]; then
    echo -e "${GREEN}Found existing configuration. Starting less go mode...${NC}"
    docker compose pull && docker compose up -d
    echo -e "${GREEN}Directory Node started!${NC}"
    exit 0
fi

echo -e "${YELLOW}Missing config. Starting setup wizard...${NC}"

read -p "Enter NODE_ID (e.g. node_king_directory): " NODE_ID
read -p "Enter SELF_ADDRESSES (comma-separated, e.g. 192.168.1.10:8000,mydir.duckdns.org:8000): " SELF_ADDRESSES
echo -e "${YELLOW}Suggestion for secrets: run 'openssl rand -hex 32' in another terminal and paste the result.${NC}"
read -p "Enter MESH_JWT_SECRET: " MESH_JWT_SECRET
read -p "Enter NODE_FEDERATION_SECRET: " NODE_FEDERATION_SECRET
read -p "Enter ADMIN_USERNAME: " ADMIN_USERNAME
read -p "Enter ADMIN_PASSWORD: " ADMIN_PASSWORD
read -p "Enter DB_PATH (default: ./data/registry.db): " DB_PATH
DB_PATH=${DB_PATH:-./data/registry.db}
read -p "Enter CHROMA_PATH (default: ./data/chroma): " CHROMA_PATH
CHROMA_PATH=${CHROMA_PATH:-./data/chroma}
read -p "Enter HOST_PORT (default: 8000): " HOST_PORT
HOST_PORT=${HOST_PORT:-8000}

PEER_NODES=""
while true; do
    read -p "Add a peer node? (y/n): " ADD_PEER
    if [ "$ADD_PEER" == "y" ]; then
        read -p "Enter PEER_ID: " PEER_ID
        read -p "Enter PEER_ADDRESSES: " PEER_ADDRESSES
        PEER_NODES="${PEER_NODES}${PEER_ID}=${PEER_ADDRESSES};"
    else
        break
    fi
done

cat <<EOF > .env
NODE_MODE=directory
NODE_ID=${NODE_ID}
SELF_ADDRESSES=${SELF_ADDRESSES}
MESH_JWT_SECRET=${MESH_JWT_SECRET}
NODE_FEDERATION_SECRET=${NODE_FEDERATION_SECRET}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
DB_PATH=${DB_PATH}
CHROMA_PATH=${CHROMA_PATH}
PEER_NODES=${PEER_NODES}
EOF

cat <<EOF > docker-compose.yml
services:
  backend:
    image: wasayabdul51/react-files-hub:latest
    env_file: .env
    volumes:
      - ./data:/app/data
    ports:
      - "${HOST_PORT}:8000"
    restart: unless-stopped
EOF

echo -e "${GREEN}Configuration saved. Pulling and starting...${NC}"
docker compose pull && docker compose up -d
echo -e "${GREEN}Directory Node started!${NC}"
