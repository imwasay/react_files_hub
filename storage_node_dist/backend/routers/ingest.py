from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from datetime import datetime
import logging

from database import get_db_dep
from models.file import File
from models.node import Node
from middleware.federation_middleware import verify_federation_token

router = APIRouter()
logger = logging.getLogger(__name__)

_chroma_client = None


def _get_chroma():
    global _chroma_client
    from config import get_settings
    import chromadb
    settings = get_settings()
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=settings.vector_store_path)
    return _chroma_client.get_or_create_collection("ntrides_files")


class Chunk(BaseModel):
    index: int
    text: str
    embedding: List[float]


class PushVectorsRequest(BaseModel):
    file_id: str
    chunks: List[Chunk]


class StatusRequest(BaseModel):
    file_id: str
    status: str  # indexed | failed | skipped
    reason: str = ""


@router.post("/push-vectors")
def push_vectors(
    body: PushVectorsRequest,
    db: Session = Depends(get_db_dep),
    node: Node = Depends(verify_federation_token),
):
    f = db.query(File).filter(File.id == body.file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    collection = _get_chroma()
    ids = [f"{body.file_id}_chunk_{c.index}" for c in body.chunks]
    docs = [c.text for c in body.chunks]
    embeddings = [c.embedding for c in body.chunks]
    metadatas = [
        {
            "file_id": body.file_id,
            "chunk_index": c.index,
            "user_id": f.owner_id,
            "file_type": f.file_type or "",
            "node_id": node.node_id,
        }
        for c in body.chunks
    ]

    collection.upsert(ids=ids, documents=docs, embeddings=embeddings, metadatas=metadatas)
    f.index_status = "processing"
    logger.info("Received %d chunks for file %s", len(body.chunks), body.file_id)

    return {"accepted": True, "file_id": body.file_id}


@router.patch("/status")
def update_status(
    body: StatusRequest,
    db: Session = Depends(get_db_dep),
    node: Node = Depends(verify_federation_token),
):
    f = db.query(File).filter(File.id == body.file_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    f.index_status = body.status
    if body.status == "indexed":
        f.indexed_at = datetime.utcnow()

    return {"ok": True}
