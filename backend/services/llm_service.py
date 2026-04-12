import httpx
import asyncio
import logging
from typing import Optional
from datetime import datetime, timedelta

from config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

_cached_host: Optional[str] = None
_cached_at: Optional[datetime] = None
_cache_ttl = timedelta(seconds=30)
_lock = asyncio.Lock()


async def _probe_host(host: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"http://{host}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


async def get_live_host() -> Optional[str]:
    global _cached_host, _cached_at

    async with _lock:
        if _cached_host and _cached_at and datetime.utcnow() - _cached_at < _cache_ttl:
            return _cached_host

        hosts = settings.llm_hosts_list
        for host in hosts:
            if await _probe_host(host):
                _cached_host = host
                _cached_at = datetime.utcnow()
                logger.info("LLM host resolved: %s", host)
                return host

        _cached_host = None
        _cached_at = datetime.utcnow()
        logger.warning("No LLM host reachable from: %s", hosts)
        return None


async def get_llm_client() -> Optional[httpx.AsyncClient]:
    host = await get_live_host()
    if not host:
        return None
    return httpx.AsyncClient(base_url=f"http://{host}", timeout=60)


async def is_llm_available() -> bool:
    return (await get_live_host()) is not None
