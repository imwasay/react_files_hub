from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid, secrets

from database import get_db_dep
from models.share import Share
from models.file import File
from middleware.auth_middleware import get_current_user
from models.user import User

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


@router.get("/s/{token}")
def resolve_share(token: str, db: Session = Depends(get_db_dep)):
    share = db.query(Share).filter(Share.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Share link expired")
    if not share.is_public:
        return {"requires_auth": True}

    f = share.file
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    return {
        "file_id": f.id,
        "filename": f.filename,
        "file_type": f.file_type,
        "size_bytes": f.size_bytes,
        "node_status": f.node.status,
        "stream_url": f"/api/v1/files/{f.id}/stream",
    }
