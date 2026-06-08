#!/bin/bash
YELLOW='\033[0;33m'
NC='\033[0m'

if [ "$1" == "--help" ]; then
    echo -e "${YELLOW}dev_restart.sh — Quick helper to show deployment instructions${NC}"
    echo "Usage: ./dev_restart.sh"
    exit 0
fi

echo "================================================"
echo " Files Hub — Production Restart Instructions"
echo "================================================"
echo ""
echo "SSH into Optiplex and run:"
echo "  ssh user@optiplex"
echo "  cd /path/to/prod && ./deploy_dir.sh"
echo ""
echo "For storage node (friend's machine):"
echo "  ./deploy_storage.sh"
echo ""
echo "To push new image after code changes:"
echo "  ./push_image.sh [optional-tag]"
echo "================================================"
