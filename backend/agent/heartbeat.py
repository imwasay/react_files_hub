import asyncio
import httpx
import logging
import os
from datetime import datetime

from config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

FEDERATION_TOKEN = os.environ.get("FEDERATION_TOKEN", "")


async def _get_dir_url() -> str:
    for contact in settings.dir_node_contacts:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                r = await client.get(f"http://{contact}:8000/api/v1/health")
                if r.status_code == 200:
                    return f"http://{contact}:8000"
        except Exception:
            continue
    raise ConnectionError("Directory node unreachable on all contacts")


async def _send_heartbeat():
    try:
        url = await _get_dir_url()
        cache_used = _get_cache_used_bytes()
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{url}/api/v1/nodes/heartbeat",
                json={
                    "node_id": settings.node_id,
                    "node_ip": settings.node_ip,
                    "cache_used_bytes": cache_used,
                    "status": "online",
                },
                headers={"X-Federation-Token": FEDERATION_TOKEN},
            )
            if r.status_code == 200:
                logger.debug("Heartbeat OK at %s", datetime.utcnow())
            else:
                logger.warning("Heartbeat failed: %s", r.text)
    except Exception as e:
        logger.warning("Heartbeat error: %s", e)


def _get_cache_used_bytes() -> int:
    cache_path = "/data/cache"
    total = 0
    if os.path.isdir(cache_path):
        for f in os.scandir(cache_path):
            if f.is_file():
                total += f.stat().st_size
    return total


async def start_heartbeat():
    async def _loop():
        while True:
            await _send_heartbeat()
            await asyncio.sleep(60)
    asyncio.create_task(_loop())
