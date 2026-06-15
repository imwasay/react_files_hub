from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, RedirectResponse
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from collections import defaultdict
import uuid, secrets, os, tempfile, shutil

from database import get_db_dep
from models.share import Share
from models.file import File
from middleware.auth_middleware import get_current_user
from models.user import User
from config import get_settings

router = APIRouter()


class CreateShareRequest(BaseModel):
    target_type: str  # file | root
    target_id: str
    granted_to: Optional[str] = None
    access_level: str = "read"
    allow_reshare: bool = False
    expires_at: Optional[datetime] = None


@router.post("", status_code=201)
def create_share(
    body: CreateShareRequest,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    token = secrets.token_urlsafe(24)
    share = Share(
        id=str(uuid.uuid4()),
        file_id=body.target_id if body.target_type == "file" else None,
        mapped_root_id=body.target_id if body.target_type == "root" else None,
        granted_by=user.id,
        granted_to=body.granted_to,
        access_level=body.access_level,
        token=token,
        is_public=body.granted_to is None,
        allow_reshare=body.allow_reshare,
        expires_at=body.expires_at,
    )
    db.add(share)
    db.commit()  # persist to DB
    db.refresh(share)
    return {
        "share_id": share.id,
        "token": token,
        "share_url": f"/s/{token}",
        "expires_at": body.expires_at,
    }


@router.get("")
def list_shares(
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    shares = db.query(Share).filter(Share.granted_by == user.id).all()
    return [
        {
            "share_id": s.id,
            "target_type": "file" if s.file_id else "root",
            "target_id": s.file_id or s.mapped_root_id,
            "granted_to": s.granted_to,
            "is_public": s.is_public,
            "share_url": f"/s/{s.token}",
            "expires_at": s.expires_at,
            "created_at": s.created_at,
        }
        for s in shares
    ]


# NOTE: /s/{token} must be declared BEFORE /{share_id} to avoid route ambiguity
@router.get("/s/{token}")
def resolve_share(token: str, db: Session = Depends(get_db_dep)):
    share = db.query(Share).filter(Share.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Share link expired")
    if not share.is_public:
        return {"requires_auth": True}

    if share.mapped_root_id:
        root = share.mapped_root
        if not root:
            raise HTTPException(status_code=404, detail="Folder not found")
        return {
            "target_type": "root",
            "root_id": root.id,
            "filename": root.logical_name,
            "node_status": root.node.status if root.node else None,
            "download_url": f"/api/v1/shares/s/{token}/download",
            "browse_url": f"/api/v1/shares/s/{token}/browse",
        }

    f = share.file
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    return {
        "target_type": "file",
        "file_id": f.id,
        "filename": f.filename,
        "file_type": f.file_type,
        "size_bytes": f.size_bytes,
        "node_status": f.node.status if f.node else None,
        "stream_url": f"/api/v1/shares/s/{token}/files/{f.id}/stream",
        "download_url": f"/api/v1/shares/s/{token}/download",
    }


@router.get("/s/{token}/download")
def download_share(token: str, db: Session = Depends(get_db_dep)):
    share = db.query(Share).filter(Share.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Share link expired")

    if share.file_id:
        f = share.file
        if not f:
            raise HTTPException(status_code=404, detail="File not found")
        # Reuse existing proxy function from files.py
        from routers.files import stream_file_proxy, _stream_local_file
        settings = get_settings()
        if settings.self_node_id and f.node.node_id == settings.self_node_id:
            if not os.path.isfile(f.real_path):
                raise HTTPException(status_code=404, detail=f"File not found on disk")
            return FileResponse(
                f.real_path,
                media_type=f.mime_type or "application/octet-stream",
                filename=f.filename,
            )
        # Using Redirect for remote node because stream_file_proxy needs Request object with range header
        # Actually, if we just want download, a Redirect is sufficient.
        # But wait, without token, redirecting to /api/v1/files/x/download will throw 401.
        # We need to stream it! Let's just import stream_file_proxy.
        pass

    if share.mapped_root_id:
        root = share.mapped_root
        if not root:
            raise HTTPException(status_code=404, detail="Folder not found")
            
        settings = get_settings()
        if settings.self_node_id and root.node.node_id != settings.self_node_id:
            raise HTTPException(status_code=501, detail="Folder download from remote node not supported yet")
            
        if not os.path.isdir(root.real_path):
            raise HTTPException(status_code=404, detail="Folder path not found on disk")
            
        fd, temp_path = tempfile.mkstemp(suffix=".zip")
        os.close(fd)
        
        base_name = temp_path[:-4]
        shutil.make_archive(base_name, 'zip', root.real_path)
        zip_path = base_name + ".zip"
        
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=f"{root.logical_name}.zip",
            background=BackgroundTask(os.remove, zip_path)
        )

@router.get("/s/{token}/files/{file_id}/stream")
async def stream_share_file(token: str, file_id: str, request: Request, db: Session = Depends(get_db_dep)):
    share = db.query(Share).filter(Share.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Share link expired")

    # Validate file is in share
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
        
    if share.file_id and share.file_id != f.id:
        raise HTTPException(status_code=403, detail="File not in share")
    elif share.mapped_root_id and share.mapped_root_id != f.mapped_root_id:
        raise HTTPException(status_code=403, detail="File not in shared folder")

    from routers.files import stream_file_proxy, _stream_local_file
    settings = get_settings()
    if settings.self_node_id and f.node.node_id == settings.self_node_id:
        if not os.path.isfile(f.real_path):
            raise HTTPException(status_code=404, detail=f"File not found on disk")
        range_header = request.headers.get("range")
        return _stream_local_file(f.real_path, f.mime_type or "application/octet-stream", f.filename, range_header)

    range_header = request.headers.get("range")
    return await stream_file_proxy(f, range_header)

@router.get("/s/{token}/files/{file_id}/download")
async def download_share_file(token: str, file_id: str, request: Request, db: Session = Depends(get_db_dep)):
    return await stream_share_file(token, file_id, request, db)


@router.get("/s/{token}/browse")
def browse_share(
    token: str,
    path: Optional[str] = Query(None),
    sort: str = Query("name"),
    order: str = Query("asc"),
    db: Session = Depends(get_db_dep),
):
    share = db.query(Share).filter(Share.token == token).first()
    if not share or not share.mapped_root_id:
        raise HTTPException(status_code=404, detail="Share not found or is not a folder")
        
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Share link expired")
        
    root = share.mapped_root
    if not root:
        raise HTTPException(status_code=404, detail="Folder not found")
        
    path_clean = path.strip("/") if path else ""
    parts = [p for p in path_clean.split("/") if p]
    
    base_q = db.query(File).filter(File.mapped_root_id == root.id)
    root_logical = root.logical_name
    
    if path_clean:
        prefix = root_logical.rstrip("/") + "/" + path_clean + "/"
    else:
        prefix = root_logical.rstrip("/") + "/"
        
    candidate_files = base_q.filter(File.logical_path.like(f"{prefix}%")).all()
    
    folders = defaultdict(lambda: {"count": 0, "total_size": 0})
    direct_files = []
    
    for f in candidate_files:
        remainder = f.logical_path[len(prefix):]
        remaining_parts = remainder.split("/")
        
        if len(remaining_parts) == 1:
            direct_files.append(f)
        else:
            folder_name = remaining_parts[0]
            folders[folder_name]["count"] += 1
            folders[folder_name]["total_size"] += f.size_bytes or 0
            
    items = []
    for fname, info in sorted(folders.items(), key=lambda x: x[0].lower()):
        items.append({
            "name": fname,
            "type": "folder",
            "path": f"{path_clean.rstrip('/')}/{fname}".strip("/"),
            "item_count": info["count"],
            "total_size": info["total_size"],
        })
        
    for f in direct_files:
        has_thumb = f.file_type in ("image", "video")
        items.append({
            "name": f.filename,
            "type": "file",
            "path": f.logical_path,
            "file_id": f.id,
            "file_type": f.file_type,
            "mime_type": f.mime_type,
            "size_bytes": f.size_bytes or 0,
            "modified_at": f.modified_at.isoformat() if f.modified_at else None,
            "index_status": f.index_status,
            "node_status": f.node.status if f.node else None,
            "node_reachable": (f.node.status == "online") if f.node else False,
            "is_cached": len(f.cache_entries) > 0,
            "has_thumbnail": has_thumb,
        })
        
    file_items = [i for i in items if i["type"] == "file"]
    folder_items = [i for i in items if i["type"] == "folder"]
    
    reverse = order.lower() == "desc"
    sort_key_map = {
        "name": lambda x: (x.get("name") or "").lower(),
        "size": lambda x: x.get("size_bytes") or x.get("total_size") or 0,
        "date": lambda x: x.get("modified_at") or "",
        "type": lambda x: x.get("file_type") or x.get("type") or "",
    }
    key_fn = sort_key_map.get(sort, sort_key_map["name"])
    
    folder_items.sort(key=key_fn, reverse=reverse)
    file_items.sort(key=key_fn, reverse=reverse)
    
    parent = "/".join(parts[:-1]) if len(parts) > 1 else ""
    
    def _build_breadcrumbs(parts: list[str]):
        crumbs = []
        for i, part in enumerate(parts):
            crumbs.append({
                "name": part,
                "path": "/".join(parts[: i + 1]),
            })
        return crumbs
        
    return {
        "items": folder_items + file_items,
        "current_path": path_clean,
        "parent_path": parent if path_clean else None,
        "breadcrumbs": _build_breadcrumbs(parts),
        "root_id": root.id,
        "root_name": root.logical_name,
        "node_id": root.node.node_id if root.node else None,
    }


@router.delete("/{share_id}", status_code=204)
def delete_share(
    share_id: str,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    share = db.query(Share).filter(Share.id == share_id, Share.granted_by == user.id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    db.delete(share)
    db.commit()  # persist deletion
