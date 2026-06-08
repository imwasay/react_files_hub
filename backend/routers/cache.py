from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import uuid, os
from cryptography.fernet import Fernet

from database import get_db_dep
from models.file_cache import FileCache, NodeCacheConfig
from models.cache_key import CacheKey
from models.file import File
from models.node import Node
from middleware.auth_middleware import get_current_user, require_admin
from middleware.federation_middleware import verify_federation_token
from models.user import User

router = APIRouter()
admin_router = APIRouter()


class CacheKeyRequest(BaseModel):
    file_id: str
    node_id: str


class EvictRequest(BaseModel):
    node_id: Optional[str] = None
    file_id: Optional[str] = None


@router.post("/key")
def get_cache_key(
    body: CacheKeyRequest,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    f = db.query(File).filter(File.id == body.file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    # verify user has access
    if f.owner_id != user.id:
        from models.share import Share
        share = db.query(Share).filter(
            Share.file_id == body.file_id,
            Share.granted_to == user.id,
        ).first()
        if not share:
            raise HTTPException(status_code=403, detail="Access denied")

    node = db.query(Node).filter(Node.node_id == body.node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # find or create cache key
    existing = db.query(CacheKey).filter(
        CacheKey.file_id == body.file_id,
        CacheKey.node_id == node.id,
        CacheKey.expires_at > datetime.utcnow(),
    ).first()

    if existing:
        return {"decryption_key": existing.encrypted_key, "expires_at": existing.expires_at}

    key = Fernet.generate_key().decode()
    expires_at = datetime.utcnow() + timedelta(hours=1)
    cache_key = CacheKey(
        id=str(uuid.uuid4()),
        file_id=body.file_id,
        node_id=node.id,
        encrypted_key=key,
        expires_at=expires_at,
    )
    db.add(cache_key)
    return {"decryption_key": key, "expires_at": expires_at}


@router.delete("/{file_id}/{node_id}", status_code=204)
def evict_cache(
    file_id: str,
    node_id: str,
    db: Session = Depends(get_db_dep),
    node: Node = Depends(verify_federation_token),
):
    target_node = db.query(Node).filter(Node.node_id == node_id).first()
    if not target_node:
        raise HTTPException(status_code=404, detail="Node not found")

    entry = db.query(FileCache).filter(
        FileCache.file_id == file_id,
        FileCache.cached_on_node_id == target_node.id,
    ).first()
    if entry:
        db.delete(entry)

    db.query(CacheKey).filter(
        CacheKey.file_id == file_id,
        CacheKey.node_id == target_node.id,
    ).delete()


@router.get("/status/{node_id}")
def cache_status(
    node_id: str,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    node = db.query(Node).filter(Node.node_id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    config = node.cache_config
    entries = db.query(FileCache).filter(FileCache.cached_on_node_id == node.id).all()

    return {
        "budget_bytes": config.budget_bytes if config else 0,
        "used_bytes": sum((e.size_bytes or 0) for e in entries),
        "eviction_policy": config.eviction_policy if config else "lru",
        "cached_files": [
            {
                "file_id": e.file_id,
                "filename": e.file.filename,
                "size_bytes": e.size_bytes,
                "last_served_at": e.last_served_at,
            }
            for e in entries
        ],
    }


# admin router
@admin_router.get("/nodes")
def admin_nodes(db: Session = Depends(get_db_dep), user: User = Depends(require_admin)):
    nodes = db.query(Node).all()
    return [
        {
            "node_id": n.node_id,
            "status": n.status,
            "last_seen": n.last_seen,
            "cache_budget": n.cache_config.budget_bytes if n.cache_config else 0,
            "cache_used": sum((c.size_bytes or 0) for c in n.cache_entries),
        }
        for n in nodes
    ]


@admin_router.get("/users")
def admin_users(db: Session = Depends(get_db_dep), user: User = Depends(require_admin)):
    from models.user import User as UserModel
    users = db.query(UserModel).all()
    return [
        {"user_id": u.id, "username": u.username, "email": u.email, "role": u.role, "last_seen": u.last_seen}
        for u in users
    ]


@admin_router.post("/cache/evict")
def admin_evict(
    body: EvictRequest,
    db: Session = Depends(get_db_dep),
    user: User = Depends(require_admin),
):
    q = db.query(FileCache)
    if body.node_id:
        node = db.query(Node).filter(Node.node_id == body.node_id).first()
        if node:
            q = q.filter(FileCache.cached_on_node_id == node.id)
    if body.file_id:
        q = q.filter(FileCache.file_id == body.file_id)
    count = q.delete()
    return {"evicted": count}
