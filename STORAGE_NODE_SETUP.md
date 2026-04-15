# Storage Node Setup Guide

This guide walks you through adding a **friend's machine** (or a second machine you own) as a storage node to your `files_hub` instance at `file.ntrides.com.au`.

---

## How it works

```
Friend's machine                    Optiplex (directory node)
────────────────                    ─────────────────────────
storage node runs            ─heartbeat→   registry.db knows node is online
local disk (e.g. /mnt/data)  ─sync→        file metadata stored centrally
                             ←stream req─  directory proxies download requests
```

The storage node:
- Watches its own local disk and pushes **metadata only** to the directory node
- Never uploads the actual files — bytes stay on the friend's machine
- Sends a heartbeat every 60s so the directory node knows it's reachable
- Serves files directly via WireGuard IP when both machines are on the same VPN

---

## Step 1 — Connect to the WireGuard VPN

The friend's machine must join the WireGuard mesh so the directory node can reach it. If you don't already have WireGuard set up:

```bash
# On the friend's machine (Ubuntu/Debian)
sudo apt install wireguard

# Ask the Optiplex admin for:
#   - A wg-quick config file (wg0.conf)
#   - Their public key
#   - An available IP in 10.72.0.0/24 (e.g. 10.72.0.3)

sudo cp wg0.conf /etc/wireguard/wg0.conf
sudo wg-quick up wg0
sudo systemctl enable wg-quick@wg0  # persist across reboots

# Test connectivity
ping 10.72.0.1   # should reach the Optiplex
```

> **Tip:** Use `wg show` to verify the connection is active.

---

## Step 2 — Register the node in the Admin Panel

On the Optiplex, go to **Admin → Nodes → Register node**:

| Field | Example value |
|---|---|
| Node ID | `alice-home` |
| Subdomain | `alice.ntrides.com.au` (optional) |
| WireGuard IP | `10.72.0.3` |
| Owner username | `alice` (must exist in Users tab first) |
| OS | Linux |

Click **Register**. Copy the **federation token** that appears — you'll need it in Step 4.

---

## Step 3 — Install Docker on the friend's machine

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker run --rm hello-world
```

---

## Step 4 — Clone and configure

```bash
cd ~
git clone https://github.com/youruser/react_files_hub.git
cd react_files_hub

# Copy the storage node env template
cp .env.storage.example .env
```

Edit `.env` and fill in:

```bash
NODE_MODE=storage
NODE_ID=alice-home                      # must match what you registered in Step 2

DIR_NODE_WG_IP=10.72.0.1               # Optiplex's WireGuard IP

FEDERATION_TOKEN=<paste token from Step 2>
JWT_SECRET=<same JWT_SECRET as the Optiplex>

MAPPED_ROOTS=/mnt/data                  # the path(s) you want to share

NODE_WG_IP=10.72.0.3                   # this machine's WireGuard IP
```

> **Important:** `JWT_SECRET` must be **identical** to the value in the Optiplex's `.env`.

---

## Step 5 — Mount the drives in docker-compose

Edit `docker-compose.storage.yml` to add your local drives:

```yaml
services:
  backend:
    volumes:
      - ./data:/data
      - /mnt/data:/mnt/data:ro        # add your actual paths here
      - /mnt/movies:/mnt/movies:ro
```

Only paths listed here will be visible inside the container.

---

## Step 6 — Deploy

```bash
cd ~/react_files_hub
bash scripts/deploy-storage.sh
```

This builds the image and starts the storage node. You should see in the logs:

```
Starting files_hub node — mode: storage
Heartbeat sent — directory node responded OK
Watcher started — watching /mnt/data
```

Check it registered in the Admin panel: **Admin → Nodes** — the node status should turn `online` within 30 seconds.

---

## Step 7 — Add mapped roots

Go to **Admin → Mapped Roots** on the Optiplex and add:

| Node | Logical name | Real path |
|---|---|---|
| `alice-home` | `Alice Movies` | `/mnt/movies` |

A background scan will start automatically. Files appear in **Browse** within a minute.

---

## Step 8 — Grant access to users (optional)

By default only the node owner sees the storage node's files.

Go to **Admin → Access Control**, select the root, select the user, and click **Grant access**. That user's Browse view will then include those files.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Node stays `offline` | Check WireGuard: `ping 10.72.0.1` from the storage machine |
| "No mapped root found" in sync log | Add the root in Admin → Mapped Roots before starting the watcher |
| Files not appearing | Check that the drive path is mounted in `docker-compose.storage.yml` |
| Federation token rejected | Verify `JWT_SECRET` matches the Optiplex exactly |
| Can't stream a file | Make sure the WireGuard tunnel is active; the directory proxies if direct fails |

---

## Updating the storage node

```bash
cd ~/react_files_hub
git pull
bash scripts/deploy-storage.sh
```

---

## Removing a storage node

1. Go to **Admin → Nodes** and click **Delete** on the node.
   This removes all its file metadata from the registry.
2. On the friend's machine: `docker compose -f docker-compose.storage.yml down`
