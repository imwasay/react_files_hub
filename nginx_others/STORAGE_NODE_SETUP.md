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
- Serves files directly via Node IP (when machines share a VPN or local network) or IPv6

---

## Step 1 — Ensure Network Connectivity

The friend's machine must be able to reach the directory node. This can be achieved through:
1. **A VPN/Mesh Network (Recommended)**: Such as Tailscale, WireGuard, or ZeroTier.
2. **Dual-Stack (IPv6)**: If both machines have globally routable IPv6 addresses.
3. **Local Area Network (LAN)**: If both machines are on the same local network.

*Motto: "As long as connectivity exists between us, the system will work."*

Verify connectivity:
```bash
# Test connectivity to the directory node
ping <directory_node_ip>
```

---

## Step 2 — Register the node in the Admin Panel

On the Optiplex, go to **Admin → Nodes → Register node**:

| Field | Example value |
|---|---|
| Node ID | `alice-home` |
| Node IP | `10.72.0.3, 2001:db8::3, alice.example.com` (comma-separated routing options) |
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

# Copy the env template
cp .env.example .env
```

Edit `.env` and fill in:

```bash
NODE_MODE=storage
NODE_ID=alice-home                      # must match what you registered in Step 2

DIR_NODE_IP=10.72.0.1, example.com   # Optiplex's contact routes

FEDERATION_TOKEN=<paste token from Step 2>
JWT_SECRET=<same JWT_SECRET as the Optiplex>

MAPPED_ROOTS=/mnt/data                  # the path(s) you want to share

NODE_IP=10.72.0.3, 2001:db8::3       # this machine's reachable routes
```

> **Important:** `JWT_SECRET` must be **identical** to the value in the Optiplex's `.env`.

---

## Step 5 — Mount the drives in docker-compose

Edit `docker-compose.yml` to add your local drives:

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
docker compose up -d --build
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
| Node stays `offline` | Check connectivity: `ping <directory_node_ip>` from the storage machine |
| "No mapped root found" in sync log | Add the root in Admin → Mapped Roots before starting the watcher |
| Files not appearing | Check that the drive path is mounted in `docker-compose.storage.yml` |
| Federation token rejected | Verify `JWT_SECRET` matches the Optiplex exactly |
| Can't stream a file | Make sure the tunnel/IPv6 is active; the directory proxies if direct fails |

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
