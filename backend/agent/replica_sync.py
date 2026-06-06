import asyncio
import httpx
import logging
import random
import time
import os

from config import get_settings
from database import get_db
from models.file import File
from models.mapped_root import MappedRoot
from models.share import Share

settings = get_settings()
logger = logging.getLogger(__name__)

FEDERATION_TOKEN = os.environ.get("FEDERATION_TOKEN", "")
_last_sync: float = 0.0


async def _fetch_diff(since: float) -> dict:
    from agent.heartbeat import _get_dir_url
    url = await _get_dir_url()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{url}/api/v1/replica/diff",
            params={"since": since},
            headers={"X-Federation-Token": FEDERATION_TOKEN},
        )
        r.raise_for_status()
        return r.json()


def _apply_diff(diff: dict):
    from models.node import Node
    from datetime import datetime
    with get_db() as db:
        for n_data in diff.get("nodes", []):
            existing = db.query(Node).filter(Node.id == n_data["id"]).first()
            last_seen_dt = datetime.utcfromtimestamp(n_data["last_seen"]) if n_data.get("last_seen") else None
            if existing:
                existing.node_id = n_data["node_id"]
                existing.node_ip = n_data["node_ip"]
                existing.status = n_data["status"]
                existing.last_seen = last_seen_dt
            else:
                db.add(Node(
                    id=n_data["id"],
                    node_id=n_data["node_id"],
                    node_ip=n_data["node_ip"],
                    host_os=n_data["host_os"],
                    status=n_data["status"],
                    owner_id=n_data["owner_id"],
                    last_seen=last_seen_dt,
                ))

        for r_data in diff.get("roots", []):
            existing = db.query(MappedRoot).filter(MappedRoot.id == r_data["id"]).first()
            if existing:
                existing.logical_name = r_data["logical_name"]
                existing.is_media_library = r_data["is_media_library"]
            else:
                db.add(MappedRoot(
                    id=r_data["id"],
                    node_id=r_data["node_id"],
                    owner_id=r_data["owner_id"],
                    logical_name=r_data["logical_name"],
                    real_path=r_data.get("real_path", ""),
                    is_media_library=r_data["is_media_library"],
                ))

        for f_data in diff.get("files", []):
            existing = db.query(File).filter(File.id == f_data["id"]).first()
            if existing:
                existing.logical_path = f_data["logical_path"]
                existing.filename = f_data["filename"]
                existing.mime_type = f_data["mime_type"]
                existing.file_type = f_data["file_type"]
                existing.size_bytes = f_data["size_bytes"]
                existing.checksum = f_data["checksum"]
                existing.index_status = f_data["index_status"]
            else:
                db.add(File(
                    id=f_data["id"],
                    node_id=f_data["node_id"],
                    mapped_root_id=f_data.get("mapped_root_id"),
                    owner_id=f_data.get("owner_id"),
                    logical_path=f_data["logical_path"],
                    real_path=f_data.get("real_path", ""),
                    filename=f_data["filename"],
                    mime_type=f_data["mime_type"],
                    file_type=f_data["file_type"],
                    size_bytes=f_data["size_bytes"],
                    checksum=f_data["checksum"],
                    index_status=f_data["index_status"],
                ))

        for s_data in diff.get("shares", []):
            existing = db.query(Share).filter(Share.id == s_data["id"]).first()
            if not existing:
                share = Share(
                    id=s_data["id"],
                    file_id=s_data.get("file_id"),
                    token=s_data["token"],
                    is_public=s_data["is_public"],
                    expires_at=s_data.get("expires_at"),
                    granted_by="system",
                )
                db.add(share)


async def _sync_once():
    global _last_sync
    try:
        diff = await _fetch_diff(_last_sync)
        _apply_diff(diff)
        _last_sync = diff.get("server_time", time.time())
        logger.debug("Replica sync complete, server_time=%s", _last_sync)
    except Exception as e:
        logger.warning("Replica sync failed: %s", e)


async def start_replica_sync():
    async def _loop():
        while True:
            await _sync_once()
            jitter = random.randint(0, settings.replica_poll_jitter_max)
            await asyncio.sleep(settings.replica_poll_base + jitter)

    asyncio.create_task(_loop())
