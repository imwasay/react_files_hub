from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from jose import jwt
from datetime import datetime, timedelta
from typing import Optional
import uuid

from config import get_settings
from database import get_db_dep
from models.node import Node
from models.file_cache import NodeCacheConfig
from middleware.auth_middleware import get_current_user, require_admin
from middleware.federation_middleware import verify_federation_token
from models.user import User

router = APIRouter()
settings = get_settings()


class RegisterNodeRequest(BaseModel):
    node_id: str
    node_ip: Optional[str] = None
    host_os: str = "linux"


class HeartbeatRequest(BaseModel):
    node_id: str
    node_ip: Optional[str] = None
    cache_used_bytes: int = 0
    status: str = "online"


def _make_federation_token(node_id: str) -> str:
    exp = datetime.utcnow() + timedelta(days=365)
    return jwt.encode(
        {"node_id": node_id, "type": "federation", "exp": exp},
        settings.jwt_secret,
        algorithm="HS256",
    )


@router.post("/register", status_code=201)
def register_node(
    body: RegisterNodeRequest,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    if db.query(Node).filter(Node.node_id == body.node_id).first():
        raise HTTPException(status_code=400, detail="Node ID already registered")

    node = Node(
        id=str(uuid.uuid4()),
        node_id=body.node_id,
        node_ip=body.node_ip,
        host_os=body.host_os,
        status="offline",
        owner_id=user.id,
    )
    db.add(node)

    config = NodeCacheConfig(
        id=str(uuid.uuid4()),
        node_id=node.id,
        budget_bytes=10 * 1024 ** 3,
        used_bytes=0,
        eviction_policy="lru",
    )
    db.add(config)

    return {"node_uuid": node.id, "federation_token": _make_federation_token(body.node_id)}


@router.post("/heartbeat")
def heartbeat(
    body: HeartbeatRequest,
    db: Session = Depends(get_db_dep),
    node: Node = Depends(verify_federation_token),
):
    node.node_ip = body.node_ip or node.node_ip
    node.status = body.status
    node.last_seen = datetime.utcnow()

    if node.cache_config:
        node.cache_config.used_bytes = body.cache_used_bytes

    return {"ok": True, "server_time": datetime.utcnow().isoformat()}


@router.get("")
def list_nodes(
    db: Session = Depends(get_db_dep),
    user: User = Depends(require_admin),
):
    nodes = db.query(Node).all()
    return [
        {
            "node_id": n.node_id,
            "status": n.status,
            "owner": n.owner.username,
            "cache_budget_bytes": n.cache_config.budget_bytes if n.cache_config else 0,
            "cache_used_bytes": n.cache_config.used_bytes if n.cache_config else 0,
            "last_seen": n.last_seen,
        }
        for n in nodes
    ]


@router.get("/{node_id}/status")
def node_status(
    node_id: str,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    node = db.query(Node).filter(Node.node_id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return {
        "node_id": node.node_id,
        "status": node.status,
        "last_seen": node.last_seen,
        "cache_used_bytes": node.cache_config.used_bytes if node.cache_config else 0,
    }
