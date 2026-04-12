from fastapi import FastAPI
from fastapi.responses import JSONResponse
import httpx
import asyncio
import json
import os
import logging
from datetime import datetime
from pydantic_settings import BaseSettings


class EdgeSettings(BaseSettings):
    dir_node_wg_ip: str = "10.72.0.1"
    dir_node_ipv6: str = ""
    dir_node_ipv4: str = ""
    registry_cache_path: str = "/data/registry_cache.json"
    registry_cache_ttl: int = 120

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = EdgeSettings()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(docs_url=None, redoc_url=None)

_cache: dict = {}
_cache_updated_at: datetime = datetime.min
_dir_online: bool = False


async def _refresh_cache():
    global _cache, _cache_updated_at, _dir_online
    contacts = [settings.dir_node_wg_ip]
    if settings.dir_node_ipv6:
        contacts.append(f"[{settings.dir_node_ipv6}]")
    if settings.dir_node_ipv4:
        contacts.append(settings.dir_node_ipv4)

    for contact in contacts:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"http://{contact}:8000/api/v1/health")
                if r.status_code == 200:
                    _dir_online = True
                    # fetch and cache registry snapshot
                    snap = await client.get(f"http://{contact}:8000/api/v1/replica/diff?since=0")
                    if snap.status_code == 200:
                        _cache = snap.json()
                        _cache_updated_at = datetime.utcnow()
                        with open(settings.registry_cache_path, "w") as f:
                            json.dump(_cache, f)
                        logger.info("Registry cache refreshed at %s", _cache_updated_at)
                    return
        except Exception:
            continue

    _dir_online = False
    logger.warning("Directory node unreachable — serving stale cache")

    if not _cache and os.path.exists(settings.registry_cache_path):
        with open(settings.registry_cache_path) as f:
            _cache = json.load(f)


@app.on_event("startup")
async def startup():
    await _refresh_cache()

    async def _loop():
        while True:
            await asyncio.sleep(settings.registry_cache_ttl)
            await _refresh_cache()

    asyncio.create_task(_loop())


@app.get("/api/v1/health")
def health():
    age = (datetime.utcnow() - _cache_updated_at).total_seconds() if _cache_updated_at != datetime.min else -1
    return {
        "dir_node_online": _dir_online,
        "replica_age_seconds": int(age),
        "vps_node_id": "oracle-sydney",
    }


@app.get("/api/v1/files")
def cached_files():
    """Serve stale file list when dir node is offline."""
    if _dir_online:
        return JSONResponse(status_code=502, content={"error": "use_dir_node"})
    return {"files": _cache.get("files", []), "cached": True, "read_only": True}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def fallback(path: str):
    if _dir_online:
        return JSONResponse(status_code=502, content={"error": "use_dir_node"})
    return JSONResponse(
        status_code=503,
        content={"error": "directory_node_offline", "read_only": True},
    )
