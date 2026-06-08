# FTS5 SEARCH — replaced ChromaDB pipeline
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Tuple
import logging

from models.file import File
from models.node import Node

logger = logging.getLogger(__name__)


def search_files(
    db: Session,
    user_id: str,
    q: str,
    file_type: Optional[str],
    node_id: Optional[str],
    page: int,
    limit: int,
) -> Tuple[list, bool]:
    """
    Search files using SQLite FTS5 with BM25 ranking.
    Falls back to simple ILIKE filename search if FTS5 syntax fails.
    """
    offset = (page - 1) * limit
    
    # Base params for the query
    params = {
        "query": q,
        "user_id": user_id,
        "limit": limit,
        "offset": offset
    }

    # Build WHERE clause for normal file filters
    where_clauses = ["f.owner_id = :user_id"]
    if file_type:
        where_clauses.append("f.file_type = :file_type")
        params["file_type"] = file_type
    
    if node_id:
        node = db.query(Node).filter(Node.node_id == node_id).first()
        if node:
            where_clauses.append("f.node_id = :db_node_id")
            params["db_node_id"] = node.id
        else:
            return [], False # Node not found, return empty

    where_sql = " AND ".join(where_clauses)

    try:
        # Attempt FTS5 query
        fts_query = f"""
            SELECT f.id, f.filename, f.logical_path, f.file_type, n.status as node_status, bm25(file_fts) as rank
            FROM file_fts
            JOIN files f ON file_fts.file_id = f.id
            JOIN nodes n ON f.node_id = n.id
            WHERE file_fts MATCH :query AND {where_sql}
            ORDER BY rank
            LIMIT :limit OFFSET :offset
        """
        rows = db.execute(text(fts_query), params).fetchall()
        
        results = [
            {
                "file_id": row.id,
                "filename": row.filename,
                "logical_path": row.logical_path,
                "snippet": None,
                "score": 1.0 / (row.rank + 1.0) if row.rank else 1.0,  # rough normalization
                "node_status": row.node_status,
                "file_type": row.file_type,
            }
            for row in rows
        ]
        return results, False  # False = llm_available flag is false

    except Exception as e:
        logger.warning("FTS5 search failed (possibly invalid syntax), falling back to filename search: %s", e)
        
        # Fallback to simple filename search
        query = db.query(File).filter(
            File.owner_id == user_id,
            File.filename.ilike(f"%{q}%"),
        )
        if file_type:
            query = query.filter(File.file_type == file_type)
        if node_id:
            node = db.query(Node).filter(Node.node_id == node_id).first()
            if node:
                query = query.filter(File.node_id == node.id)
                
        files = query.offset(offset).limit(limit).all()
        results = [
            {
                "file_id": f.id,
                "filename": f.filename,
                "logical_path": f.logical_path,
                "snippet": None,
                "score": 1.0,
                "node_status": f.node.status,
                "file_type": f.file_type,
            }
            for f in files
        ]
        return results, False
