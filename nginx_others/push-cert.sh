#!/usr/bin/env bash
set -euo pipefail

# push-cert.sh — renew wildcard cert locally, push to all nodes via internal network
# run on directory node only

CERT_PATH="/etc/letsencrypt/live/ntrides.com.au"
NODES=(
    "10.214.83.2"   # node-b
    "10.214.83.3"   # node-c
    # add more Node IPs here
)
NODE_USER="ubuntu"
REMOTE_CERT_PATH="/etc/letsencrypt/live/ntrides.com.au"

echo "Renewing certificate..."
sudo certbot renew --quiet

echo "Pushing cert to all nodes..."
for NODE_IP in "${NODES[@]}"; do
    echo "  → $NODE_IP"
    ssh "${NODE_USER}@${NODE_IP}" "sudo mkdir -p ${REMOTE_CERT_PATH}"
    sudo scp "${CERT_PATH}/fullchain.pem" "${NODE_USER}@${NODE_IP}:${REMOTE_CERT_PATH}/fullchain.pem"
    sudo scp "${CERT_PATH}/privkey.pem"   "${NODE_USER}@${NODE_IP}:${REMOTE_CERT_PATH}/privkey.pem"
    ssh "${NODE_USER}@${NODE_IP}" "sudo nginx -t && sudo systemctl reload nginx"
    echo "    done."
done

echo "Reloading local NGINX..."
sudo nginx -t && sudo systemctl reload nginx

echo "Cert renewal and push complete."
