import asyncio
import httpx
import logging
import os
from datetime import datetime, timedelta
from jose import jwt

from config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

def _get_federation_token() -> str:
    exp = datetime.utcnow() + timedelta(days=365)
    return jwt.encode(
        {"node_id": settings.self_node_id, "type": "federation", "exp": exp},
        settings.jwt_secret,
        algorithm="HS256",
    )

async def _announce_to_peer(peer_addr: str):
    base_url = peer_addr
    if not base_url.startswith("http://") and not base_url.startswith("https://"):
        base_url = f"http://{base_url}"
    url = f"{base_url.rstrip('/')}/api/v1/sync/announce"
    
    node_id = settings.node_id or settings.self_node_id or "unknown"
    node_ip = settings.node_ip or ""
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                url,
                json={
                    "node_id": node_id,
                    "addresses": node_ip,
                    "host_os": settings.host_os
                },
                headers={"X-Federation-Token": _get_federation_token()}
            )
            if r.status_code == 200:
                logger.debug("Announced successfully to peer %s", peer_addr)
            else:
                logger.warning("Announcement to peer %s failed: %d", peer_addr, r.status_code)
    except Exception as e:
        logger.warning("Announcement to peer %s failed with exception: %s", peer_addr, e)

async def start_heartbeat():
    async def _loop():
        # Delay startup slightly to let the server start
        await asyncio.sleep(3)
        while True:
            peers = settings.peer_nodes_list
            if not peers:
                logger.debug("No peer nodes configured for heartbeats.")
            else:
                for peer_node_id, addresses in peers:
                    for addr in addresses:
                        asyncio.create_task(_announce_to_peer(addr))
            await asyncio.sleep(60)
    asyncio.create_task(_loop())
