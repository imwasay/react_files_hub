from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db_dep
from models.file import File
from models.node import Node
from models.user import User
from models.mapped_root import MappedRoot
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

router = APIRouter()

class SyncFileMetadata(BaseModel):
    id: str
    logical_path: str
    real_path: str
    filename: str
    mime_type: Optional[str]
    file_type: Optional[str]
    size_bytes: int
    checksum: Optional[str]
    modified_at: Optional[str]
    created_at: Optional[str]
    owner_username: str
    node_id: str
    node_ip: Optional[str]
    root_logical_name: str
    root_real_path: str

@router.get("/metadata", response_model=List[SyncFileMetadata])
def get_metadata_delta(since: Optional[float] = None, db: Session = Depends(get_db_dep)):
    query = db.query(File)
    if since:
        dt = datetime.utcfromtimestamp(since)
        query = query.filter(File.created_at >= dt)
    
    files = query.all()
    res = []
    for f in files:
        # Skip files that don't have relationships setup
        if not f.node or not f.mapped_root:
            continue
        res.append(SyncFileMetadata(
            id=f.id,
            logical_path=f.logical_path,
            real_path=f.real_path,
            filename=f.filename,
            mime_type=f.mime_type,
            file_type=f.file_type,
            size_bytes=f.size_bytes or 0,
            checksum=f.checksum,
            modified_at=f.modified_at.isoformat() if f.modified_at else None,
            created_at=f.created_at.isoformat() if f.created_at else None,
            owner_username=f.owner.username if f.owner else "admin",
            node_id=f.node.node_id,
            node_ip=f.node.node_ip,
            root_logical_name=f.mapped_root.logical_name,
            root_real_path=f.mapped_root.real_path
        ))
    return res

class AnnouncePayload(BaseModel):
    node_id: str
    addresses: str
    host_os: str = "linux"

@router.post("/announce")
def announce_node(body: AnnouncePayload, db: Session = Depends(get_db_dep)):
    node = db.query(Node).filter(Node.node_id == body.node_id).first()
    
    owner = db.query(User).filter(User.role == "owner").first()
    if not owner:
        owner = db.query(User).filter(User.role == "admin").first()
    if not owner:
        import uuid
        owner = User(id=str(uuid.uuid4()), username="admin", email="admin@y.com", password_hash="disabled", role="owner")
        db.add(owner)
        db.commit()
        db.refresh(owner)

    if not node:
        import uuid
        node = Node(
            id=str(uuid.uuid4()),
            node_id=body.node_id,
            node_ip=body.addresses,
            host_os=body.host_os,
            status="online",
            owner_id=owner.id,
            last_seen=datetime.utcnow()
        )
        db.add(node)
        from models.file_cache import NodeCacheConfig
        cache_cfg = NodeCacheConfig(
            id=str(uuid.uuid4()),
            node_id=node.id,
            budget_bytes=10 * 1024 ** 3,
            used_bytes=0,
            eviction_policy="lru"
        )
        db.add(cache_cfg)
    else:
        node.node_ip = body.addresses
        node.status = "online"
        node.last_seen = datetime.utcnow()
    
    db.commit()
    return {"ok": True}

class SyncUser(BaseModel):
    id: str
    username: str
    email: str
    password_hash: str
    role: str
    created_at: Optional[str]

@router.get("/users", response_model=List[SyncUser])
def get_users_delta(db: Session = Depends(get_db_dep)):
    users = db.query(User).all()
    res = []
    for u in users:
        res.append(SyncUser(
            id=u.id,
            username=u.username,
            email=u.email,
            password_hash=u.password_hash,
            role=u.role,
            created_at=u.created_at.isoformat() if u.created_at else None
        ))
    return res
