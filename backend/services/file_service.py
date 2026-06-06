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
        "strategy": "direct" if direct_url else "proxy",
        "source": "origin",
        "direct": {"url": direct_url, "expires_in": 600} if direct_url else None,
        # Proxy fallback: directory node streams it server-side
        "proxy": {"stream_url": f"/api/v1/files/{file.id}/stream"},
        "proxy_fallback": True,
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
            if ip.startswith("http://") or ip.startswith("https://"):
                base_url = f"{ip}/internal/files"
            else:
                base_url = f"http://{ip}:8000/internal/files"
                
            try:
                async with httpx.AsyncClient() as client:
                    from urllib.parse import quote
                    encoded_path = quote(serve_path, safe="")
                    async with client.stream("GET", f"{base_url}?path={encoded_path}", headers=headers, timeout=5.0) as r:
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
