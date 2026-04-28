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

    token = _make_serve_token(file.id, user.id)

    # if node has an IPv6 address, suggest direct — client will try with timeout
    if node.ipv6 and not settings.force_ipv4:
        return {
            "strategy": "direct",
            "source": "origin",
            "direct": {
                "url": f"https://{node.subdomain}/serve/{token}",
                "token": token,
                "expires_at": (datetime.utcnow() + timedelta(minutes=5)).isoformat(),
            },
            "proxy_fallback": f"/api/v1/files/{file.id}/stream",
        }

    # IPv4 only — proxy through directory node
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

    # build internal WG URL to fetch from node agent
    base_url = f"http://{serve_node.node_ip}:8001/internal/files"
    headers = {"X-Federation-Token": _make_internal_token(serve_node.node_id)}
    if range_header:
        headers["Range"] = range_header

    async def _stream():
        async with httpx.AsyncClient() as client:
            async with client.stream("GET", f"{base_url}?path={serve_path}", headers=headers) as r:
                async for chunk in r.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk

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
