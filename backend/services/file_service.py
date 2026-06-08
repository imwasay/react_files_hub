from jose import jwt
from datetime import datetime, timedelta
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional
import httpx

from config import get_settings
from models.file import File
from models.user import User

settings = get_settings()


def _make_serve_token(file_id: str, user_id: str, real_path: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=10)
    return jwt.encode(
        {"file_id": file_id, "sub": user_id, "real_path": real_path, "exp": exp},
        settings.jwt_secret,
        algorithm="HS256",
    )


def resolve_serve_strategy(file: File, user: User) -> dict:
    node = file.node

    # if origin node is offline, check for a cache copy
    if node.status != "online":
        for cache_entry in file.cache_entries:
            cache_node = cache_entry.cached_on_node
            if cache_node.status == "online":
                token = _make_serve_token(file.id, user.id, file.real_path)
                return {
                    "strategy": "direct",
                    "source": "cache",
                    "direct": {
                        "url": f"https://{cache_node.subdomain}/serve/{token}",
                        "token": token,
                        "expires_at": (datetime.utcnow() + timedelta(minutes=10)).isoformat(),
                    },
                }
        # no cache available either
        return {
            "strategy": "unavailable",
            "reason": f"Node {node.node_id} is offline and no cache copy exists",
        }

    # Origin node is online — give the frontend a direct URL to stream from
    # the storage node, with a signed serve token (no user credentials needed).
    # The frontend will HEAD-test this and fall back to the proxy if unreachable.
    ips = [ip.strip() for ip in node.node_ip.split(",") if ip.strip()] if node.node_ip else []
    token = _make_serve_token(file.id, user.id, file.real_path)

    # Primary: find the best URL for the frontend to hit directly
    direct_url = None
    if ips:
        # Prefer HTTPS public domains for the frontend to avoid Mixed Content
        best_ip = next((ip for ip in ips if ip.startswith("https://")), ips[0])
        if best_ip.startswith("http://") or best_ip.startswith("https://"):
            direct_url = f"{best_ip}/internal/serve?token={token}"
        else:
            direct_url = f"http://{best_ip}:8000/internal/serve?token={token}"

    return {
        "strategy": "proxy",  # Forced to proxy for caching
        "source": "origin",
        "direct": {"url": direct_url, "expires_in": 600} if direct_url else None,
        # Proxy: directory node streams it server-side
        "proxy": {"stream_url": f"/api/v1/files/{file.id}/stream"},
        "proxy_fallback": True,
    }


async def _bg_download_file(file, ips, cache_path, self_node_db_id):
    if not file.size_bytes or file.size_bytes > 500 * 1024 * 1024:
        return
    import httpx, aiofiles, urllib.parse, os, uuid
    tmp_path = cache_path + ".tmp"
    if os.path.exists(tmp_path) or os.path.exists(cache_path):
        return
    
    encoded_path = urllib.parse.quote(file.real_path)
    req_headers = {"X-Federation-Token": _make_internal_token(file.node.node_id)}
    
    async with httpx.AsyncClient() as client:
        for ip in ips:
            base_url = f"{ip}/internal/files" if ip.startswith("http") else f"http://{ip}:8000/internal/files"
            try:
                async with client.stream("GET", f"{base_url}?path={encoded_path}", headers=req_headers, timeout=30.0) as r:
                    if r.status_code != 200: continue
                    async with aiofiles.open(tmp_path, "wb") as f:
                        async for chunk in r.aiter_bytes(chunk_size=128 * 1024):
                            await f.write(chunk)
                os.rename(tmp_path, cache_path)
                from database import SessionLocal
                from models.file_cache import FileCache
                db = SessionLocal()
                try:
                    ce = db.query(FileCache).filter(FileCache.file_id == file.id, FileCache.cached_on_node_id == self_node_db_id).first()
                    if not ce:
                        ce = FileCache(id=str(uuid.uuid4()), file_id=file.id, cached_on_node_id=self_node_db_id, encrypted_path=cache_path, checksum="", size_bytes=file.size_bytes)
                        db.add(ce)
                    else:
                        ce.size_bytes = file.size_bytes
                    db.commit()
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).error("Failed to update cache DB: %s", e)
                finally:
                    db.close()
                break
            except Exception:
                continue


async def stream_file_proxy(file: File, range_header: Optional[str] = None) -> StreamingResponse:
    node = file.node

    # pick serving node — origin or best cache
    serve_node = None
    serve_path = file.real_path

    if node.status == "online":
        serve_node = node
    else:
        for entry in file.cache_entries:
            if entry.cached_on_node.status == "online":
                serve_node = entry.cached_on_node
                serve_path = entry.encrypted_path
                break

    if not serve_node:
        raise HTTPException(status_code=503, detail="File unavailable — no online node")

    ips = [ip.strip() for ip in serve_node.node_ip.split(",") if ip.strip()] if serve_node.node_ip else []
    if not ips:
        raise HTTPException(status_code=503, detail="Node has no configured IP")

    # ── Proxy Cache Logic ───────────────────────────────────────────────────
    import os
    import logging
    import aiofiles
    from database import SessionLocal
    from models.file_cache import FileCache

    logger = logging.getLogger(__name__)

    # Parse requested range
    start = 0
    end = file.size_bytes - 1 if file.size_bytes else None
    if range_header:
        try:
            range_val = range_header.replace("bytes=", "")
            parts = range_val.split("-")
            start = int(parts[0]) if parts[0] else 0
            if len(parts) > 1 and parts[1]:
                end = int(parts[1])
        except Exception:
            pass

    if end is not None and file.size_bytes:
        end = min(end, file.size_bytes - 1)

    # Check local prefix cache
    cache_dir = "/data/cache"
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, file.id)

    db = SessionLocal()
    try:
        from models.node import Node
        self_node = db.query(Node).filter(Node.node_id == settings.self_node_id).first()
        self_node_db_id = self_node.id if self_node else None

        cache_entry = None
        if self_node_db_id:
            cache_entry = db.query(FileCache).filter(
                FileCache.file_id == file.id,
                FileCache.cached_on_node_id == self_node_db_id
            ).first()

        cached_bytes = cache_entry.size_bytes if cache_entry else 0
        
        # If cache is partial or missing but DB says it exists, clear it
        if cached_bytes > 0 and (cached_bytes != file.size_bytes or not os.path.isfile(cache_path)):
            cached_bytes = 0
            db.delete(cache_entry)
            db.commit()
            if os.path.exists(cache_path):
                os.remove(cache_path)
    finally:
        db.close()

    async def _stream():
        current_offset = start

        # 1. Yield from local cache ONLY if FULLY cached
        if cached_bytes > 0 and cached_bytes == file.size_bytes:
            local_end = min(end, cached_bytes - 1) if end is not None else cached_bytes - 1
            try:
                async with aiofiles.open(cache_path, "rb") as f_local:
                    await f_local.seek(current_offset)
                    remaining = local_end - current_offset + 1
                    while remaining > 0:
                        chunk = await f_local.read(min(64 * 1024, remaining))
                        if not chunk:
                            break
                        yield chunk
                        remaining -= len(chunk)
            except Exception as e:
                logger.error("Error reading local cache for %s: %s", file.id, e)
                raise RuntimeError("Cache read failed")
            return

        # 2. Not fully cached — spawn background downloader (if small enough)
        if self_node_db_id and file.size_bytes and file.size_bytes <= 500 * 1024 * 1024:
            import asyncio
            asyncio.create_task(_bg_download_file(file, ips, cache_path, self_node_db_id))

        # 3. Proxy the current request directly from origin (no inline caching)
        fetch_range = f"bytes={current_offset}-"
        if end is not None:
            fetch_range = f"bytes={current_offset}-{end}"
        
        req_headers = {
            "X-Federation-Token": _make_internal_token(serve_node.node_id),
            "Range": fetch_range
        }
        
        success = False
        for ip in ips:
            base_url = f"{ip}/internal/files" if ip.startswith("http") else f"http://{ip}:8000/internal/files"
            try:
                async with httpx.AsyncClient() as client:
                    from urllib.parse import quote
                    encoded_path = quote(serve_path, safe="")
                    
                    async with client.stream("GET", f"{base_url}?path={encoded_path}", headers=req_headers, timeout=5.0) as r:
                        r.raise_for_status()
                        async for chunk in r.aiter_bytes(chunk_size=64 * 1024):
                            yield chunk
                success = True
                break  # Stream completed successfully
            except Exception as e:
                logger.warning("Proxy stream failed via IP %s: %s", ip, e)
                continue
        
        if not success:
            logger.error("Failed to reach storage node %s on any configured IP", serve_node.node_id)
            raise RuntimeError("Failed to reach storage node on any configured IP")

    status_code = 206 if range_header else 200
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{file.filename}"'
    }
    if end is not None:
        headers["Content-Length"] = str(end - start + 1)
        if status_code == 206 and file.size_bytes:
            headers["Content-Range"] = f"bytes {start}-{end}/{file.size_bytes}"

    return StreamingResponse(
        _stream(),
        status_code=status_code,
        media_type=file.mime_type or "application/octet-stream",
        headers=headers,
    )


def _make_internal_token(node_id: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=1)
    return jwt.encode({"node_id": node_id, "exp": exp}, settings.jwt_secret, algorithm="HS256")
