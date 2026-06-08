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
    - Iterates every row in the files table
    - Per-file errors are caught silently so one bad file never aborts the run
    - Progress is logged every 100 files
    - Returns {"reindexed": count, "errors": error_count}
    """
    files = db.query(File).all()
    total = len(files)
    count = 0
    error_count = 0

    for n, f in enumerate(files, start=1):
        try:
            index_file(
                db_session=None,    # opens its own session per file
                file_id=f.id,
                real_path=f.real_path or "",
                filename=f.filename,
                relative_path=f.logical_path or "",
                mime_type=f.mime_type or "",
            )
            count += 1
        except Exception as e:
            logger.warning("Reindex error for file %s (%s): %s", f.id, f.filename, e)
            error_count += 1

        if n % 100 == 0:
            logger.info("Reindex progress: %d/%d", n, total)

    logger.info("Reindex complete: %d indexed, %d errors out of %d total.", count, error_count, total)
    return {"reindexed": count, "errors": error_count}
