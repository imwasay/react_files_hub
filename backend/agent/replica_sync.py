import asyncio
import httpx
import logging
import random
import time
import os
from datetime import datetime, timedelta
from jose import jwt

from config import get_settings
from database import get_db
from models.file import File
from models.node import Node
from models.user import User
from models.mapped_root import MappedRoot

settings = get_settings()
logger = logging.getLogger(__name__)

def _get_federation_token() -> str:
    exp = datetime.utcnow() + timedelta(days=365)
    return jwt.encode(
        {"node_id": settings.self_node_id, "type": "federation", "exp": exp},
        settings.jwt_secret,
        algorithm="HS256",
    )

# Keep track of the last sync timestamp per peer address/IP
_last_sync_by_peer = {}

async def _fetch_diff_from_peer(peer_addr: str, since: float) -> tuple[list, list, list]:
    base_url = peer_addr
    if not base_url.startswith("http://") and not base_url.startswith("https://"):
        base_url = f"http://{base_url}"
    
    headers = {"X-Federation-Token": _get_federation_token()}
    async with httpx.AsyncClient(timeout=15) as client:
        # Fetch metadata
        url_metadata = f"{base_url.rstrip('/')}/api/v1/sync/metadata"
        r_meta = await client.get(url_metadata, params={"since": since}, headers=headers)
        r_meta.raise_for_status()
        
        # Fetch users
        url_users = f"{base_url.rstrip('/')}/api/v1/sync/users"
        r_users = await client.get(url_users, headers=headers)
        r_users.raise_for_status()
        
        # Fetch nodes
        url_nodes = f"{base_url.rstrip('/')}/api/v1/sync/nodes"
        r_nodes = await client.get(url_nodes, headers=headers)
        r_nodes.raise_for_status()
        
        return r_meta.json(), r_users.json(), r_nodes.json()

def _apply_peer_diff(files_data: list, users_data: list, nodes_data: list) -> tuple[int, list]:
    applied = 0
    files_to_cache = []
    with get_db() as db:
        # Get self_node
        self_node = db.query(Node).filter(Node.node_id == settings.self_node_id).first()
        self_node_db_id = self_node.id if self_node else None

        # Sync users first
        for u_data in users_data:
            existing_user = db.query(User).filter(User.username == u_data["username"]).first()
            if not existing_user:
                created_dt = datetime.fromisoformat(u_data["created_at"]) if u_data.get("created_at") else datetime.utcnow()
                db.add(User(
                    id=u_data["id"],
                    username=u_data["username"],
                    email=u_data["email"],
                    password_hash=u_data["password_hash"],
                    role=u_data["role"],
                    created_at=created_dt
                ))
            else:
                existing_user.email = u_data["email"]
                existing_user.password_hash = u_data["password_hash"]
                existing_user.role = u_data["role"]
        
        db.commit()

        # Get or create default owner fallback
        owner = db.query(User).filter(User.role == "owner").first()
        if not owner:
            owner = db.query(User).filter(User.role == "admin").first()
        if not owner:
            import uuid
            owner = User(id=str(uuid.uuid4()), username="admin", email="admin@y.com", password_hash="disabled", role="owner")
            db.add(owner)
            db.commit()
            db.refresh(owner)

        # Sync nodes before syncing files
        for n_data in nodes_data:
            existing_node = db.query(Node).filter(Node.node_id == n_data["node_id"]).first()
            if not existing_node:
                import uuid
                new_node = Node(
                    id=n_data["id"],
                    node_id=n_data["node_id"],
                    node_ip=n_data["node_ip"],
                    host_os=n_data["host_os"],
                    status=n_data["status"],
                    owner_id=owner.id,
                    last_seen=datetime.utcnow()
                )
                db.add(new_node)
                from models.file_cache import NodeCacheConfig
                db.add(NodeCacheConfig(
                    id=str(uuid.uuid4()),
                    node_id=new_node.id,
                    budget_bytes=10 * 1024 ** 3,
                    used_bytes=0,
                    eviction_policy="lru"
                ))
            else:
                existing_node.node_ip = n_data["node_ip"]
                existing_node.status = n_data["status"]
        db.commit()

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
            
            # Index into FTS5 for search (even without text content, filename is indexed)
            from agent.ingestion import index_file
            index_file(db, f_data["id"], "", f_data["filename"], f_data["logical_path"], f_data["mime_type"])
            
            applied += 1
            
            # Queue for pre-caching
            if self_node_db_id and f_data.get("size_bytes") and f_data.get("size_bytes") <= 10 * 1024 * 1024 * 1024:
                cache_dir = "/data/cache"
                os.makedirs(cache_dir, exist_ok=True)
                cache_path = os.path.join(cache_dir, f_data["id"])
                ips = [ip.strip() for ip in (node.node_ip or "").split(",") if ip.strip()]
                if ips:
                    files_to_cache.append({
                        "file_id": f_data["id"],
                        "file_size_bytes": f_data["size_bytes"],
                        "file_real_path": f_data["real_path"],
                        "node_id": node.node_id,
                        "ips": ips,
                        "cache_path": cache_path,
                        "self_node_db_id": self_node_db_id
                    })

        db.commit()
    return applied, files_to_cache

async def sync_peer(peer_node_id: str, addresses: list[str]):
    global _last_sync_by_peer
    # Try addresses sequentially until one works
    for addr in addresses:
        since = _last_sync_by_peer.get(addr, 0.0)
        start_time = time.time()
        try:
            logger.info("Syncing metadata from peer %s via %s (since=%s)", peer_node_id, addr, since)
            files_data, users_data, nodes_data = await _fetch_diff_from_peer(addr, since)
            count, files_to_cache = _apply_peer_diff(files_data, users_data, nodes_data)
            _last_sync_by_peer[addr] = start_time
            logger.info("Successfully synced %d files from peer %s via %s", count, peer_node_id, addr)
            
            # Fire off background cache downloads for all new/modified files
            if files_to_cache:
                from services.file_service import _bg_download_file
                for item in files_to_cache:
                    asyncio.create_task(_bg_download_file(**item))
                    
            return True
        except Exception as e:
            logger.warning("Failed to sync from peer %s via %s: %s", peer_node_id, addr, e)
    return False

async def start_replica_sync():
    async def _loop():
        # Delay startup sync slightly to let the server initialize fully
        await asyncio.sleep(5)
        while True:
            # Combine static config peers with dynamically discovered peers from the DB
            peers_dict = {}
            for nid, addrs in settings.peer_nodes_list:
                peers_dict[nid] = addrs
                
            try:
                with get_db() as db:
                    nodes = db.query(Node).all()
                    for n in nodes:
                        if n.node_id != settings.self_node_id and n.node_ip:
                            addrs = [ip.strip() for ip in n.node_ip.split(",") if ip.strip()]
                            if addrs:
                                peers_dict[n.node_id] = addrs
            except Exception as e:
                logger.error("Failed to fetch dynamic peers from DB: %s", e)

            if not peers_dict:
                logger.debug("No peer nodes configured for gossip sync.")
            else:
                for peer_node_id, addresses in peers_dict.items():
                    # Run sync tasks for each peer concurrently
                    asyncio.create_task(sync_peer(peer_node_id, addresses))
            
            jitter = random.randint(0, settings.replica_poll_jitter_max)
            await asyncio.sleep(settings.replica_poll_base + jitter)

    asyncio.create_task(_loop())
