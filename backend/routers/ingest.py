from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import logging

from database import get_db_dep
from models.file import File
from models.node import Node
from middleware.federation_middleware import verify_federation_token
from agent.ingestion import index_file

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/reindex")
def reindex_all(
    db: Session = Depends(get_db_dep),
    node: Node = Depends(verify_federation_token),
):
    """
    Manually triggers FTS5 reindexing for all files currently in the database.
    This replaces the old webhook-based ingestion queue mechanism.
    """
    files = db.query(File).all()
    count = 0
    for f in files:
        index_file(f.id, f.filename, f.logical_path, f.real_path, f.mime_type)
        count += 1
    
    logger.info("Reindexed %d files for FTS5.", count)
    return {"reindexed": count}
