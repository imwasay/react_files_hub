from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import jwt
from typing import Optional, List
from datetime import datetime, timedelta
import uuid
import os

from database import get_db_dep
from middleware.auth_middleware import require_admin
from models.user import User
from models.node import Node
from models.file import File
from models.file_cache import FileCache, NodeCacheConfig
from models.share import Share
from models.mapped_root import MappedRoot
from config import get_settings

router = APIRouter()
settings = get_settings()
_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


# ── system info ───────────────────────────────────────────────────────────────

@router.get("/system")
def admin_system(db: Session = Depends(get_db_dep), _: User = Depends(require_admin)):
    """Return system-level stats: counts, DB size, disk usage of mapped roots."""
    total_users = db.query(User).count()
    total_nodes = db.query(Node).count()
    total_roots = db.query(MappedRoot).count()
    total_files = db.query(File).count()
    total_shares = db.query(Share).count()
    index_counts = {}
    for row in db.execute(
        __import__("sqlalchemy").text("SELECT index_status, COUNT(*) FROM files GROUP BY index_status")
    ):
        index_counts[row[0]] = row[1]

    # DB file sizes
    db_path = settings.db_path
    db_size = os.path.getsize(db_path) if os.path.isfile(db_path) else 0

    # Disk usage per mapped root (only those accessible from inside container)
    roots_info = []
    for r in db.query(MappedRoot).all():
        info = {
            "root_id": r.id,
            "logical_name": r.logical_name,
            "real_path": r.real_path,
            "accessible": os.path.isdir(r.real_path),
        }
        if info["accessible"]:
            try:
                stat = os.statvfs(r.real_path)
                info["total_bytes"] = stat.f_blocks * stat.f_frsize
                info["free_bytes"] = stat.f_bavail * stat.f_frsize
                info["used_bytes"] = (stat.f_blocks - stat.f_bfree) * stat.f_frsize
            except Exception:
                pass
        roots_info.append(info)

    return {
        "counts": {
            "users": total_users,
            "nodes": total_nodes,
            "roots": total_roots,
            "files": total_files,
            "shares": total_shares,
        },
        "index_status": index_counts,
        "db_size_bytes": db_size,
        "roots_disk": roots_info,
    }


# ── users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(db: Session = Depends(get_db_dep), _: User = Depends(require_admin)):
    users = db.query(User).all()
    return [
        {
            "user_id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "created_at": u.created_at,
            "last_seen": u.last_seen,
        }
        for u in users
    ]


class CreateUserRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "viewer"


@router.post("/users", status_code=201)
def admin_create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db_dep),
    admin: User = Depends(require_admin),
):
    """Admin endpoint to create a user with a specific role."""
    if body.role not in ("viewer", "admin", "owner"):
        raise HTTPException(status_code=400, detail="Invalid role — must be viewer, admin, or owner")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    user = User(
        id=str(uuid.uuid4()),
        username=body.username,
        email=body.email,
        password_hash=_pwd.hash(body.password),
        role=body.role,
    )
    db.add(user)
    return {"user_id": user.id, "username": user.username, "role": user.role}


class PatchUserRequest(BaseModel):
    role: Optional[str] = None
    active: Optional[bool] = None


@router.patch("/users/{user_id}")
def patch_user(
    user_id: str,
    body: PatchUserRequest,
    db: Session = Depends(get_db_dep),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own account via admin")
    if body.role is not None:
        if body.role not in ("viewer", "owner", "admin", "deactivated"):
            raise HTTPException(status_code=400, detail="Invalid role")
        user.role = body.role
    if body.active is False:
        user.role = "deactivated"
    return {"ok": True, "user_id": user_id}


@router.delete("/users/{user_id}", status_code=204)
def admin_delete_user(
    user_id: str,
    db: Session = Depends(get_db_dep),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if user.role == "owner":
        raise HTTPException(status_code=400, detail="Cannot delete an owner account")
    db.delete(user)


# ── nodes ─────────────────────────────────────────────────────────────────────

@router.get("/nodes")
def list_nodes(db: Session = Depends(get_db_dep), _: User = Depends(require_admin)):
    nodes = db.query(Node).all()
    return [
        {
            "node_id": n.node_id,
            "node_ip": n.node_ip,
            "host_os": n.host_os,
            "status": n.status,
            "last_seen": n.last_seen,
            "owner": n.owner.username if n.owner else None,
            "cache_budget": n.cache_config.budget_bytes if n.cache_config else 0,
            "cache_used": n.cache_config.used_bytes if n.cache_config else 0,
            "cache_budget_bytes": n.cache_config.budget_bytes if n.cache_config else 0,
            "cache_used_bytes": n.cache_config.used_bytes if n.cache_config else 0,
            "root_count": len(n.mapped_roots),
            "file_count": len(n.files),
        }
        for n in nodes
    ]


class AdminRegisterNodeRequest(BaseModel):
    node_id: str
    node_ip: Optional[str] = None
    host_os: str = "linux"
    owner_username: str  # which user owns this node


@router.post("/nodes", status_code=201)
def admin_register_node(
    body: AdminRegisterNodeRequest,
    db: Session = Depends(get_db_dep),
    _: User = Depends(require_admin),
):
    """Register a new storage node and return its federation token."""
    if db.query(Node).filter(Node.node_id == body.node_id).first():
        raise HTTPException(status_code=400, detail="Node ID already registered")

    owner = db.query(User).filter(User.username == body.owner_username).first()
    if not owner:
        raise HTTPException(status_code=404, detail=f"User '{body.owner_username}' not found")

    node = Node(
        id=str(uuid.uuid4()),
        node_id=body.node_id,
        node_ip=body.node_ip,
        host_os=body.host_os,
        status="offline",
        owner_id=owner.id,
    )
    db.add(node)

    cache_cfg = NodeCacheConfig(
        id=str(uuid.uuid4()),
        node_id=node.id,
        budget_bytes=10 * 1024 ** 3,
        used_bytes=0,
        eviction_policy="lru",
    )
    db.add(cache_cfg)
    db.flush()

    token = _make_federation_token(body.node_id)
    return {
        "node_uuid": node.id,
        "node_id": body.node_id,
        "federation_token": token,
        "message": "Copy the federation_token into FEDERATION_TOKEN in the storage node's .env",
    }


@router.delete("/nodes/{node_id}", status_code=204)
def admin_delete_node(
    node_id: str,
    db: Session = Depends(get_db_dep),
    _: User = Depends(require_admin),
):
    node = db.query(Node).filter(Node.node_id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if settings.self_node_id and node.node_id == settings.self_node_id:
        raise HTTPException(status_code=400, detail="Cannot delete the self-node")
    db.delete(node)


def _make_federation_token(node_id: str) -> str:
    exp = datetime.utcnow() + timedelta(days=365)
    return jwt.encode(
        {"node_id": node_id, "type": "federation", "exp": exp},
        settings.jwt_secret,
        algorithm="HS256",
    )


# ── mapped roots ──────────────────────────────────────────────────────────────

class CreateRootAdminRequest(BaseModel):
    node_id: str
    logical_name: str
    real_path: str
    is_media_library: bool = False


@router.get("/roots")
def admin_list_roots(db: Session = Depends(get_db_dep), _: User = Depends(require_admin)):
    roots = db.query(MappedRoot).all()
    return [
        {
            "root_id": r.id,
            "logical_name": r.logical_name,
            "real_path": r.real_path,
            "is_media_library": r.is_media_library,
            "node_id": r.node.node_id if r.node else None,
            "node_status": r.node.status if r.node else None,
            "file_count": len(r.files),
            "created_at": r.created_at,
        }
        for r in roots
    ]


@router.post("/roots", status_code=201)
def admin_create_root(
    body: CreateRootAdminRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db_dep),
    admin: User = Depends(require_admin),
):
    node = db.query(Node).filter(Node.node_id == body.node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node '{body.node_id}' not found")

    existing = db.query(MappedRoot).filter(
        MappedRoot.node_id == node.id,
        MappedRoot.logical_name == body.logical_name,
    ).first()
    if existing:
        return {
            "root_id": existing.id,
            "logical_name": existing.logical_name,
            "node_id": body.node_id,
            "already_existed": True,
        }

    root = MappedRoot(
        id=str(uuid.uuid4()),
        node_id=node.id,
        owner_id=node.owner_id,
        logical_name=body.logical_name,
        real_path=body.real_path,
        is_media_library=body.is_media_library,
    )
    db.add(root)
    db.flush()

    if settings.self_node_id and node.node_id == settings.self_node_id:
        background_tasks.add_task(_trigger_scan_for_root, body.real_path)

    return {"root_id": root.id, "logical_name": root.logical_name, "node_id": body.node_id}


def _trigger_scan_for_root(real_path: str):
    import asyncio
    import logging as _log
    node_id_str = settings.self_node_id
    if not node_id_str:
        return
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        from agent.watcher import _initial_scan_self_node
        loop.run_until_complete(_initial_scan_self_node(node_id_str, real_path))
        loop.close()
    except Exception as e:
        _log.getLogger(__name__).error("Background scan failed for %s: %s", real_path, e)


@router.delete("/roots/{root_id}", status_code=204)
def admin_delete_root(
    root_id: str,
    db: Session = Depends(get_db_dep),
    _: User = Depends(require_admin),
):
    root = db.query(MappedRoot).filter(MappedRoot.id == root_id).first()
    if not root:
        raise HTTPException(status_code=404, detail="Mapped root not found")
    db.query(Share).filter(Share.mapped_root_id == root_id).delete(synchronize_session=False)
    db.query(File).filter(File.mapped_root_id == root_id).delete(synchronize_session=False)
    db.delete(root)


@router.post("/roots/{root_id}/rescan", status_code=202)
def admin_rescan_root(
    root_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db_dep),
    _: User = Depends(require_admin),
):
    root = db.query(MappedRoot).filter(MappedRoot.id == root_id).first()
    if not root:
        raise HTTPException(status_code=404, detail="Mapped root not found")
    if not settings.self_node_id:
        raise HTTPException(status_code=400, detail="Self-node not configured")
    background_tasks.add_task(_trigger_scan_for_root, root.real_path)
    return {"ok": True, "message": f"Rescan triggered for {root.real_path}"}


# ── access control (root → user grants) ──────────────────────────────────────

class GrantAccessRequest(BaseModel):
    user_id: str


@router.get("/roots/{root_id}/grants")
def list_root_grants(
    root_id: str,
    db: Session = Depends(get_db_dep),
    _: User = Depends(require_admin),
):
    """List all users who have been granted access to a mapped root."""
    root = db.query(MappedRoot).filter(MappedRoot.id == root_id).first()
    if not root:
        raise HTTPException(status_code=404, detail="Mapped root not found")

    grants = db.query(Share).filter(
        Share.mapped_root_id == root_id,
        Share.file_id.is_(None),
    ).all()

    return [
        {
            "grant_id": s.id,
            "root_id": root_id,
            "logical_name": root.logical_name,
            "granted_to_id": s.granted_to,
            "granted_to_username": s.grantee.username if s.grantee else None,
            "is_public": s.is_public,
            "created_at": s.created_at,
        }
        for s in grants
    ]


@router.post("/roots/{root_id}/grants", status_code=201)
def grant_root_access(
    root_id: str,
    body: GrantAccessRequest,
    db: Session = Depends(get_db_dep),
    admin: User = Depends(require_admin),
):
    """Grant a user access to all files in a mapped root."""
    root = db.query(MappedRoot).filter(MappedRoot.id == root_id).first()
    if not root:
        raise HTTPException(status_code=404, detail="Mapped root not found")

    target = db.query(User).filter(User.id == body.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Already granted?
    existing = db.query(Share).filter(
        Share.mapped_root_id == root_id,
        Share.granted_to == body.user_id,
        Share.file_id.is_(None),
    ).first()
    if existing:
        return {"grant_id": existing.id, "already_existed": True}

    share = Share(
        id=str(uuid.uuid4()),
        mapped_root_id=root_id,
        file_id=None,
        granted_by=admin.id,
        granted_to=body.user_id,
        token=str(uuid.uuid4()),
        is_public=False,
        access_level="read",
    )
    db.add(share)
    return {
        "grant_id": share.id,
        "root_logical_name": root.logical_name,
        "granted_to": target.username,
    }


@router.delete("/grants/{grant_id}", status_code=204)
def revoke_grant(
    grant_id: str,
    db: Session = Depends(get_db_dep),
    _: User = Depends(require_admin),
):
    share = db.query(Share).filter(Share.id == grant_id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Grant not found")
    db.delete(share)


# ── files ─────────────────────────────────────────────────────────────────────

@router.patch("/files/{file_id}/reindex")
def reindex_file(
    file_id: str,
    db: Session = Depends(get_db_dep),
    _: User = Depends(require_admin),
):
    f = db.query(File).filter(File.id == file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    f.index_status = "pending"
    f.indexed_at = None
    return {"ok": True, "file_id": file_id}


@router.post("/files/reindex-all")
def reindex_all_files(
    db: Session = Depends(get_db_dep),
    _: User = Depends(require_admin),
):
    """Mark all failed/skipped files as pending for re-indexing."""
    count = (
        db.query(File)
        .filter(File.index_status.in_(["failed", "skipped"]))
        .update({"index_status": "pending", "indexed_at": None}, synchronize_session=False)
    )
    return {"ok": True, "queued": count}


@router.get("/files")
def admin_list_files(
    page: int = 1,
    limit: int = 50,
    file_type: Optional[str] = None,
    node_id: Optional[str] = None,
    index_status: Optional[str] = None,
    root_id: Optional[str] = None,
    db: Session = Depends(get_db_dep),
    _: User = Depends(require_admin),
):
    """Admin file list — sees ALL files regardless of owner."""
    q = db.query(File)
    if file_type:
        q = q.filter(File.file_type == file_type)
    if index_status:
        q = q.filter(File.index_status == index_status)
    if root_id:
        q = q.filter(File.mapped_root_id == root_id)
    if node_id:
        node = db.query(Node).filter(Node.node_id == node_id).first()
        if node:
            q = q.filter(File.node_id == node.id)

    total = q.count()
    files = q.order_by(File.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "files": [
            {
                "file_id": f.id,
                "filename": f.filename,
                "logical_path": f.logical_path,
                "real_path": f.real_path,
                "mime_type": f.mime_type,
                "file_type": f.file_type,
                "size_bytes": f.size_bytes,
                "index_status": f.index_status,
                "node_id": f.node.node_id if f.node else None,
                "node_status": f.node.status if f.node else None,
                "root_name": f.mapped_root.logical_name if f.mapped_root else None,
            }
            for f in files
        ],
    }


# ── cache ─────────────────────────────────────────────────────────────────────

class EvictRequest(BaseModel):
    node_id: Optional[str] = None
    file_id: Optional[str] = None


@router.post("/cache/evict")
def evict_cache(
    body: EvictRequest,
    db: Session = Depends(get_db_dep),
    _: User = Depends(require_admin),
):
    q = db.query(FileCache)
    if body.node_id:
        node = db.query(Node).filter(Node.node_id == body.node_id).first()
        if node:
            q = q.filter(FileCache.cached_on_node_id == node.id)
    if body.file_id:
        q = q.filter(FileCache.file_id == body.file_id)
    count = q.delete(synchronize_session=False)
    return {"evicted": count}


# ── shares ────────────────────────────────────────────────────────────────────

@router.get("/shares")
def list_all_shares(db: Session = Depends(get_db_dep), _: User = Depends(require_admin)):
    shares = db.query(Share).all()
    return [
        {
            "share_id": s.id,
            "target_type": "file" if s.file_id else "root",
            "target_id": s.file_id or s.mapped_root_id,
            "granted_by": s.granter.username if s.granter else None,
            "granted_to": s.grantee.username if s.grantee else None,
            "is_public": s.is_public,
            "share_url": f"/s/{s.token}",
            "expires_at": s.expires_at,
            "created_at": s.created_at,
        }
        for s in shares
    ]