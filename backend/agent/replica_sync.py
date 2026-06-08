import asyncio
import httpx
import logging
import random
import time
import os
from datetime import datetime

from config import get_settings
from database import get_db
from models.file import File
from models.node import Node
from models.user import User
from models.mapped_root import MappedRoot

settings = get_settings()
logger = logging.getLogger(__name__)

FEDERATION_TOKEN = os.environ.get("FEDERATION_TOKEN", "")

# Keep track of the last sync timestamp per peer address/IP
_last_sync_by_peer = {}

async def _fetch_diff_from_peer(peer_addr: str, since: float) -> list:
    # Handle protocols (default to http if not specified)
    base_url = peer_addr
    if not base_url.startswith("http://") and not base_url.startswith("https://"):
        base_url = f"http://{base_url}"
    
    url = f"{base_url.rstrip('/')}/api/v1/sync/metadata"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            url,
            params={"since": since},
            headers={"X-Federation-Token": FEDERATION_TOKEN},
        )
        r.raise_for_status()
        return r.json()

def _apply_peer_diff(files_data: list) -> int:
    applied = 0
    with get_db() as db:
        # Get or create default owner
        owner = db.query(User).filter(User.role == "owner").first()
        if not owner:
            owner = db.query(User).filter(User.role == "admin").first()
        if not owner:
            import uuid
            owner = User(id=str(uuid.uuid4()), username="admin", email="admin@y.com", password_hash="disabled", role="owner")
            db.add(owner)
            db.commit()
            db.refresh(owner)

        for f_data in files_data:
            # 1. Resolve Node
            node = db.query(Node).filter(Node.node_id == f_data["node_id"]).first()
            if not node:
                import uuid
                node = Node(
                    id=str(uuid.uuid4()),
                    node_id=f_data["node_id"],
                    node_ip=f_data["node_ip"] or "",
                    host_os="linux",
                    status="online",
                    owner_id=owner.id,
                    last_seen=datetime.utcnow()
                )
                db.add(node)
                db.flush()
                # Create default cache config for the peer node
                from models.file_cache import NodeCacheConfig
                cache_cfg = NodeCacheConfig(
                    id=str(uuid.uuid4()),
                    node_id=node.id,
                    budget_bytes=10 * 1024 ** 3,
                    used_bytes=0,
                    eviction_policy="lru"
                )
                db.add(cache_cfg)
                db.flush()
            else:
                if f_data.get("node_ip"):
                    node.node_ip = f_data["node_ip"]
                node.last_seen = datetime.utcnow()

            # 2. Resolve MappedRoot
            root = db.query(MappedRoot).filter(
                MappedRoot.node_id == node.id,
                MappedRoot.logical_name == f_data["root_logical_name"]
            ).first()
            if not root:
                import uuid
                root = MappedRoot(
                    id=str(uuid.uuid4()),
                    node_id=node.id,
                    owner_id=owner.id,
                    logical_name=f_data["root_logical_name"],
                    real_path=f_data["root_real_path"] or "/mnt",
                    is_media_library=False
                )
                db.add(root)
                db.flush()

            # 3. Resolve Owner (User)
            file_owner = db.query(User).filter(User.username == f_data["owner_username"]).first()
            if not file_owner:
                file_owner = owner

            # 4. Save/Update File
            existing = db.query(File).filter(File.id == f_data["id"]).first()
            
            created_dt = datetime.fromisoformat(f_data["created_at"]) if f_data.get("created_at") else datetime.utcnow()
            modified_dt = datetime.fromisoformat(f_data["modified_at"]) if f_data.get("modified_at") else None

            if existing:
                existing.logical_path = f_data["logical_path"]
                existing.filename = f_data["filename"]
                existing.mime_type = f_data["mime_type"]
                existing.file_type = f_data["file_type"]
                existing.size_bytes = f_data["size_bytes"]
                existing.checksum = f_data["checksum"]
                existing.modified_at = modified_dt
            else:
                db.add(File(
                    id=f_data["id"],
                    node_id=node.id,
                    mapped_root_id=root.id,
                    owner_id=file_owner.id,
                    logical_path=f_data["logical_path"],
                    real_path=f_data["real_path"],
                    filename=f_data["filename"],
                    mime_type=f_data["mime_type"],
                    file_type=f_data["file_type"],
                    size_bytes=f_data["size_bytes"],
                    checksum=f_data["checksum"],
                    created_at=created_dt,
                    modified_at=modified_dt
                ))
            applied += 1
        db.commit()
    return applied

async def sync_peer(peer_node_id: str, addresses: list[str]):
    global _last_sync_by_peer
    # Try addresses sequentially until one works
    for addr in addresses:
        since = _last_sync_by_peer.get(addr, 0.0)
        start_time = time.time()
        try:
            logger.info("Syncing metadata from peer %s via %s (since=%s)", peer_node_id, addr, since)
            files_data = await _fetch_diff_from_peer(addr, since)
            count = _apply_peer_diff(files_data)
            _last_sync_by_peer[addr] = start_time
            logger.info("Successfully synced %d files from peer %s via %s", count, peer_node_id, addr)
            return True
        except Exception as e:
            logger.warning("Failed to sync from peer %s via %s: %s", peer_node_id, addr, e)
    return False

async def start_replica_sync():
    async def _loop():
        # Delay startup sync slightly to let the server initialize fully
        await asyncio.sleep(5)
        while True:
            # Sync with all peers listed in PEER_NODES config
            peers = settings.peer_nodes_list
            if not peers:
                logger.debug("No peer nodes configured for gossip sync.")
            else:
                for peer_node_id, addresses in peers:
                    # Run sync tasks for each peer concurrently
                    asyncio.create_task(sync_peer(peer_node_id, addresses))
            
            jitter = random.randint(0, settings.replica_poll_jitter_max)
            await asyncio.sleep(settings.replica_poll_base + jitter)

    asyncio.create_task(_loop())
