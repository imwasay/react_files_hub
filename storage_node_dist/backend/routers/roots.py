from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import uuid

from database import get_db_dep
from models.mapped_root import MappedRoot
from models.node import Node
from middleware.auth_middleware import get_current_user
from models.user import User

router = APIRouter()


class CreateRootRequest(BaseModel):
    node_id: str
    logical_name: str
    real_path: str
    is_media_library: bool = False


@router.post("", status_code=201)
def create_root(
    body: CreateRootRequest,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    node = db.query(Node).filter(Node.node_id == body.node_id, Node.owner_id == user.id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found or not owned by you")

    existing = db.query(MappedRoot).filter(
        MappedRoot.node_id == node.id,
        MappedRoot.logical_name == body.logical_name,
    ).first()
    if existing:
        return {"root_id": existing.id, "logical_name": existing.logical_name, "node_id": body.node_id}

    root = MappedRoot(
        id=str(uuid.uuid4()),
        node_id=node.id,
        owner_id=user.id,
        logical_name=body.logical_name,
        real_path=body.real_path,
        is_media_library=body.is_media_library,
    )
    db.add(root)
    return {"root_id": root.id, "logical_name": root.logical_name, "node_id": body.node_id}


@router.get("")
def list_roots(
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    roots = db.query(MappedRoot).filter(MappedRoot.owner_id == user.id).all()
    return [
        {
            "root_id": r.id,
            "logical_name": r.logical_name,
            "node_id": r.node.node_id,
            "node_status": r.node.status,
            "is_media_library": r.is_media_library,
        }
        for r in roots
    ]


@router.delete("/{root_id}", status_code=204)
def delete_root(
    root_id: str,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    root = db.query(MappedRoot).filter(MappedRoot.id == root_id, MappedRoot.owner_id == user.id).first()
    if not root:
        raise HTTPException(status_code=404, detail="Root not found")
    db.delete(root)
