from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
import httpx
import os

from database import get_db_dep
from models.file import File
from models.node import Node
from models.mapped_root import MappedRoot
from models.share import Share
from middleware.auth_middleware import get_current_user
from middleware.federation_middleware import verify_federation_token
from services.file_service import resolve_serve_strategy, stream_file_proxy
from models.user import User
from config import get_settings

router = APIRouter()
settings = get_settings()


class FileSyncChange(BaseModel):
    op: str  # add | modify | delete
    real_path: str
    logical_path: str
    filename: str
    mime_type: Optional[str] = None
    file_type: Optional[str] = None
    size_bytes: int = 0
    checksum: Optional[str] = None
    modified_at: Optional[datetime] = None


class FileSyncRequest(BaseModel):
    node_id: str
    changes: List[FileSyncChange]


def _visible_file_filter(q, db: Session, user: User):
    """Return a query that includes:
    1. Files the user owns directly (owner_id == user.id)
    2. Files in mapped roots that have been shared with this user
    3. Files in publicly-shared mapped roots
    """
    shared_root_ids = (
        db.query(Share.mapped_root_id)
        .filter(
            Share.mapped_root_id.isnot(None),
            or_(
                Share.granted_to == user.id,
                Share.is_public == True,  # noqa: E712
            ),
        )
    )
    return q.filter(
        or_(
            File.owner_id == user.id,
            File.mapped_root_id.in_(shared_root_ids),
        )
    )


@router.get("")
def list_files(
    root_id: Optional[str] = None,
    node_id: Optional[str] = None,
    path: Optional[str] = None,
    file_type: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    q = _visible_file_filter(db.query(File), db, user)

    if root_id:
        q = q.filter(File.mapped_root_id == root_id)
    if node_id:
        node = db.query(Node).filter(Node.node_id == node_id).first()
        if node:
            q = q.filter(File.node_id == node.id)
    if path:
        q = q.filter(File.logical_path.like(f"{path}%"))
    if file_type:
        q = q.filter(File.file_type == file_type)

    total = q.count()
    files = q.offset((page - 1) * limit).limit(limit).all()

    return {
        "files": [
            {
                "file_id": f.id,
                "filename": f.filename,
                "logical_path": f.logical_path,
                "mime_type": f.mime_type,
                "file_type": f.file_type,
                "size_bytes": f.size_bytes,
                "modified_at": f.modified_at,
                "index_status": f.index_status,
                "node_status": f.node.status,
                "is_cached": len(f.cache_entries) > 0,
            }
            for f in files
        ],
        "total": total,
        "page": page,
    }


@router.get("/{file_id}")
def get_file(
    file_id: str,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    q = _visible_file_filter(db.query(File), db, user)
    f = q.filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    return {
        "file_id": f.id,
        "filename": f.filename,
        "logical_path": f.logical_path,
        "mime_type": f.mime_type,
        "file_type": f.file_type,
        "size_bytes": f.size_bytes,
        "checksum": f.checksum,
        "modified_at": f.modified_at,
        "index_status": f.index_status,
        "is_media_library": f.mapped_root.is_media_library,
        "node": {
            "node_id": f.node.node_id,
            "subdomain": f.node.subdomain,
            "ipv6": f.node.ipv6,
            "ipv4": f.node.ipv4,
            "status": f.node.status,
        },
    }


@router.get("/{file_id}/serve")
def serve_decision(
    file_id: str,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    q = _visible_file_filter(db.query(File), db, user)
    f = q.filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    f.access_count = (f.access_count or 0) + 1
    f.last_accessed_at = datetime.utcnow()

    # Self-node: if the file is on this machine, stream it locally
    if settings.self_node_id and f.node.node_id == settings.self_node_id:
        return {
            "strategy": "proxy",
            "source": "self",
            "proxy": {"stream_url": f"/api/v1/files/{file_id}/stream"},
        }

    return resolve_serve_strategy(f, user)


@router.get("/{file_id}/stream")
async def stream_file(
    file_id: str,
    request: Request,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    q = _visible_file_filter(db.query(File), db, user)
    f = q.filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    # Self-node: serve directly from local filesystem (inside container)
    if settings.self_node_id and f.node.node_id == settings.self_node_id:
        if not os.path.isfile(f.real_path):
            raise HTTPException(
                status_code=404,
                detail=f"File not found on disk: {f.real_path}. "
                       f"Check that the drive is mounted in docker-compose.directory.yml.",
            )
        range_header = request.headers.get("range")
        return _stream_local_file(f.real_path, f.mime_type or "application/octet-stream",
                                  f.filename, range_header)

    range_header = request.headers.get("range")
    return await stream_file_proxy(f, range_header)


def _stream_local_file(path: str, mime: str, filename: str,
                       range_header: Optional[str]) -> StreamingResponse:
    """Stream a file directly from the local filesystem with range support."""
    file_size = os.path.getsize(path)

    start = 0
    end = file_size - 1
    status_code = 200
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
        "Content-Length": str(file_size),
    }

    if range_header:
        try:
            range_val = range_header.replace("bytes=", "")
            parts = range_val.split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if parts[1] else file_size - 1
            end = min(end, file_size - 1)
            status_code = 206
            headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            headers["Content-Length"] = str(end - start + 1)
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

    return StreamingResponse(
        _iter(),
        status_code=status_code,
        media_type=mime,
        headers=headers,
    )


@router.post("/sync")
def sync_files(
    body: FileSyncRequest,
    db: Session = Depends(get_db_dep),
    node: Node = Depends(verify_federation_token),
):
    accepted = []
    rejected = []

    for change in body.changes:
        try:
            if change.op == "delete":
                f = db.query(File).filter(
                    File.node_id == node.id,
                    File.real_path == change.real_path,
                ).first()
                if f:
                    db.delete(f)
                accepted.append(change.real_path)
                continue

            f = db.query(File).filter(
                File.node_id == node.id,
                File.real_path == change.real_path,
            ).first()

            root = db.query(MappedRoot).filter(
                MappedRoot.node_id == node.id,
                MappedRoot.owner_id == node.owner_id,
            ).first()

            if not root:
                rejected.append({"path": change.real_path, "reason": "no mapped root found"})
                continue

            if f:
                f.filename = change.filename
                f.logical_path = change.logical_path
                f.mime_type = change.mime_type
                f.file_type = change.file_type
                f.size_bytes = change.size_bytes
                f.checksum = change.checksum
                f.modified_at = change.modified_at
                f.index_status = "pending"
            else:
                import uuid
                f = File(
                    id=str(uuid.uuid4()),
                    node_id=node.id,
                    mapped_root_id=root.id,
                    owner_id=node.owner_id,
                    logical_path=change.logical_path,
                    real_path=change.real_path,
                    filename=change.filename,
                    mime_type=change.mime_type,
                    file_type=change.file_type,
                    size_bytes=change.size_bytes,
                    checksum=change.checksum,
                    modified_at=change.modified_at,
                    index_status="pending",
                )
                db.add(f)

            accepted.append(change.real_path)
        except Exception as e:
            rejected.append({"path": change.real_path, "reason": str(e)})

    return {"accepted": len(accepted), "rejected": rejected}


@router.delete("/{file_id}", status_code=204)
def delete_file(
    file_id: str,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    f = db.query(File).filter(File.id == file_id, File.owner_id == user.id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    db.delete(f)
