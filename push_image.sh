#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

if [ "$1" == "--help" ]; then
    echo -e "${YELLOW}push_image.sh — run on daily driver after code edits${NC}"
    echo "Builds, tags, and pushes to Docker Hub"
    echo "Usage: ./push_image.sh [tag]   (default tag: latest)"
    exit 0
fi

TAG=${1:-latest}

echo -e "${YELLOW}Building and pushing react_files_hub with tag: ${TAG}...${NC}"

if docker build -t react_files_hub:$TAG .; then
    echo -e "${GREEN}Build successful.${NC}"
else
    echo -e "${RED}Build failed.${NC}"
    exit 1
fi

docker tag react_files_hub:$TAG wasayabdul51/react-files-hub:$TAG
docker tag react_files_hub:$TAG wasayabdul51/react-files-storage:$TAG

if docker push wasayabdul51/react-files-hub:$TAG && docker push wasayabdul51/react-files-storage:$TAG; then
    echo -e "${GREEN}Push successful.${NC}"
else
    echo -e "${RED}Push failed.${NC}"
    exit 1
fi

echo -e "${YELLOW}Restarting local containers to pick up the new image...${NC}"
docker compose pull
docker compose down
docker compose up -d
echo -e "${GREEN}Containers restarted successfully.${NC}"
