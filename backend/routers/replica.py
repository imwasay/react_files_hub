from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db_dep
from models.file import File
from models.mapped_root import MappedRoot
from models.share import Share
from models.node import Node
from middleware.federation_middleware import verify_federation_token

router = APIRouter()


@router.get("/diff")
def get_diff(
    since: float,
    db: Session = Depends(get_db_dep),
    node: Node = Depends(verify_federation_token),
):
    since_dt = datetime.utcfromtimestamp(since)

    files = db.query(File).filter(File.created_at >= since_dt).all()
    roots = db.query(MappedRoot).filter(MappedRoot.created_at >= since_dt).all()
    shares = db.query(Share).filter(Share.created_at >= since_dt).all()
    nodes = db.query(Node).all()  # Nodes are small, always sync full list

    return {
        "nodes": [
            {
                "id": n.id,
                "node_id": n.node_id,
                "node_ip": n.node_ip,
                "host_os": n.host_os,
                "status": n.status,
                "owner_id": n.owner_id,
                "last_seen": n.last_seen.timestamp() if n.last_seen else None,
            }
            for n in nodes
        ],
        "files": [
            {
                "id": f.id,
                "node_id": f.node.node_id,
                "mapped_root_id": f.mapped_root_id,
                "logical_path": f.logical_path,
                "real_path": f.real_path,
                "filename": f.filename,
                "mime_type": f.mime_type,
                "file_type": f.file_type,
                "size_bytes": f.size_bytes,
                "checksum": f.checksum,
                "index_status": f.index_status,
                "modified_at": f.modified_at,
                "owner_id": f.owner_id,
            }
            for f in files
        ],
        "roots": [
            {
                "id": r.id,
                "node_id": r.node.node_id,
                "owner_id": r.owner_id,
                "logical_name": r.logical_name,
                "real_path": r.real_path,
                "is_media_library": r.is_media_library,
            }
            for r in roots
        ],
        "shares": [
            {
                "id": s.id,
                "file_id": s.file_id,
                "token": s.token,
                "is_public": s.is_public,
                "expires_at": s.expires_at,
            }
            for s in shares
        ],
        "server_time": datetime.utcnow().timestamp(),
    }
