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


def _make_serve_token(file_id: str, user_id: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=5)
    return jwt.encode(
        {"file_id": file_id, "sub": user_id, "exp": exp},
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
                token = _make_serve_token(file.id, user.id)
                return {
                    "strategy": "direct",
                    "source": "cache",
                    "direct": {
                        "url": f"https://{cache_node.subdomain}/serve/{token}",
                        "token": token,
                        "expires_at": (datetime.utcnow() + timedelta(minutes=5)).isoformat(),
                    },
                }
        # no cache available either
        return {
            "strategy": "unavailable",
            "reason": f"Node {node.node_id} is offline and no cache copy exists",
        }

    # Always proxy through directory node to avoid SSL errors with direct IP connections
    return {
        "strategy": "proxy",
        "source": "origin",
        "proxy": {
            "stream_url": f"/api/v1/files/{file.id}/stream",
        },
    }


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

    headers = {"X-Federation-Token": _make_internal_token(serve_node.node_id)}
    if range_header:
        headers["Range"] = range_header

    async def _stream():
        import logging
        logger = logging.getLogger(__name__)
        
        for ip in ips:
            base_url = f"http://{ip}:8001/internal/files"
            try:
                async with httpx.AsyncClient() as client:
                    async with client.stream("GET", f"{base_url}?path={serve_path}", headers=headers, timeout=5.0) as r:
                        r.raise_for_status()
                        async for chunk in r.aiter_bytes(chunk_size=64 * 1024):
                            yield chunk
                return  # Stream completed successfully
            except Exception as e:
                logger.warning("Failed to stream from node %s via IP %s: %s", serve_node.node_id, ip, e)
                continue
        
        # If we exit the loop, all IPs failed
        raise HTTPException(status_code=502, detail="Failed to reach storage node on any configured IP")

    status_code = 206 if range_header else 200
    return StreamingResponse(
        _stream(),
        status_code=status_code,
        media_type=file.mime_type or "application/octet-stream",
        headers={"Accept-Ranges": "bytes", "Content-Disposition": f'inline; filename="{file.filename}"'},
    )


def _make_internal_token(node_id: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=1)
    return jwt.encode({"node_id": node_id, "exp": exp}, settings.jwt_secret, algorithm="HS256")
