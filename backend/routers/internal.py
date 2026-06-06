"""Internal file-serving endpoint.

Listens on the same port as the main API (8000). The directory node proxies
file-stream requests here using a short-lived federation token. This replaces
the previously non-existent port-8001 internal server.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from jose import jwt, JWTError
import os

from config import get_settings

router = APIRouter()
settings = get_settings()


def _verify_internal_token(request: Request) -> str:
    """Extract and verify the short-lived internal JWT from X-Federation-Token header."""
    token = request.headers.get("X-Federation-Token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing internal token")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        node_id = payload.get("node_id")
        if not node_id:
            raise HTTPException(status_code=401, detail="Invalid internal token")
        return node_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid internal token")


@router.get("/serve")
async def serve_direct(
    token: str = Query(..., description="Signed serve JWT issued by the directory node"),
    request: Request = None,
):
    """Frontend-facing direct serve endpoint.

    The directory node's /serve response includes a signed JWT containing
    {file_id, sub, real_path, exp}. The browser fetches this URL directly
    from the storage node, bypassing the directory node entirely for the
    data transfer.
    """
    from jose import JWTError
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        real_path = payload.get("real_path")
        if not real_path:
            raise HTTPException(status_code=401, detail="Invalid serve token: missing path")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired serve token")

    if not os.path.isfile(real_path):
        raise HTTPException(status_code=404, detail=f"File not found on disk: {real_path}")

    import mimetypes
    mime = mimetypes.guess_type(real_path)[0] or "application/octet-stream"
    filename = os.path.basename(real_path)
    file_size = os.path.getsize(real_path)

    range_header = request.headers.get("range") if request else None
    start = 0
    end = file_size - 1
    status_code = 200

    if range_header:
        try:
            range_val = range_header.replace("bytes=", "")
            parts = range_val.split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
            end = min(end, file_size - 1)
            status_code = 206
        except (ValueError, IndexError):
            pass

    def _iter():
        chunk = 64 * 1024
        with open(real_path, "rb") as fh:
            fh.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = fh.read(min(chunk, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Content-Disposition": f'inline; filename="{filename}"',
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Range",
    }
    if status_code == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

    return StreamingResponse(
        _iter(),
        status_code=status_code,
        media_type=mime,
        headers=headers,
    )


@router.get("/files")
async def serve_internal_file(
    path: str = Query(..., description="Absolute real_path of the file on this node"),
    request: Request = None,
    _node_id: str = Depends(_verify_internal_token),
):
    """Serve a raw file directly from this node's local filesystem.

    Called by the directory node when proxying a file that lives on this
    storage node. Auth is via a short-lived internal federation JWT.
    """
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"File not found on disk: {path}")

    import mimetypes
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    filename = os.path.basename(path)
    file_size = os.path.getsize(path)

    range_header = request.headers.get("range") if request else None
    start = 0
    end = file_size - 1
    status_code = 200

    if range_header:
        try:
            range_val = range_header.replace("bytes=", "")
            parts = range_val.split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
            end = min(end, file_size - 1)
            status_code = 206
        except (ValueError, IndexError):
            pass

    def _iter():
        chunk = 64 * 1024
        with open(path, "rb") as fh:
            fh.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = fh.read(min(chunk, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Content-Disposition": f'inline; filename="{filename}"',
    }
    if status_code == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

    return StreamingResponse(
        _iter(),
        status_code=status_code,
        media_type=mime,
        headers=headers,
    )
