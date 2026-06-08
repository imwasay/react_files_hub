# FTS5 SEARCH — replaced ChromaDB pipeline
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Tuple
import logging

from models.file import File
from models.node import Node
from models.mapped_root import MappedRoot

logger = logging.getLogger(__name__)


def _file_to_dict(f: File) -> dict:
    """
    Serialize a File ORM object to the same shape that browse.py returns
    for file items, so the frontend can render search results identically.
    """
    has_thumb = f.file_type in ("image", "video")
    return {
        "name": f.filename,
        "type": "file",
        "path": f.logical_path,
        "file_id": f.id,
        "file_type": f.file_type,
        "mime_type": f.mime_type,
        "size_bytes": f.size_bytes or 0,
        "modified_at": f.modified_at.isoformat() if f.modified_at else None,
        "index_status": f.index_status,
        "node_status": f.node.status if f.node else None,
        "node_reachable": (f.node.status == "online") if f.node else False,
        "is_cached": len(f.cache_entries) > 0,
        "has_thumbnail": has_thumb,
    }


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

    1. Tries FTS5 MATCH with bm25() ordering.
    2. On any exception (malformed query, table missing, etc.) falls back
       to a simple LIKE filename search.
    3. Returns a list of full file objects — same shape as browse returns —
       so the frontend can render search results without a separate adapter.
    """
    offset = (page - 1) * limit

    # ── Build optional filter clauses ─────────────────────────────────────────
    from models.share import Share
    from sqlalchemy import or_

    shared_root_ids = [
        r[0] for r in db.query(Share.mapped_root_id).filter(
            Share.mapped_root_id.isnot(None),
            or_(Share.granted_to == user_id, Share.is_public == True)
        ).all()
    ]
    
    # User can see files they own, files in roots they own, or files in roots shared with them
    owned_root_ids = [
        r[0] for r in db.query(MappedRoot.id).filter(MappedRoot.owner_id == user_id).all()
    ]
    
    all_allowed_roots = set(shared_root_ids + owned_root_ids)
    
    if all_allowed_roots:
        root_ids_str = ",".join(f"'{rid}'" for rid in all_allowed_roots)
        extra_where = [f"(f.owner_id = :user_id OR f.mapped_root_id IN ({root_ids_str}))"]
    else:
        extra_where = ["f.owner_id = :user_id"]

    params: dict = {
        "query": q,
        "user_id": user_id,
        "limit": limit,
        "offset": offset,
    }

    if file_type:
        extra_where.append("f.file_type = :file_type")
        params["file_type"] = file_type

    db_node_id = None
    if node_id:
        node = db.query(Node).filter(Node.node_id == node_id).first()
        if node:
            extra_where.append("f.node_id = :db_node_id")
            params["db_node_id"] = node.id
        else:
            return [], False   # unknown node — return empty

    where_sql = " AND ".join(extra_where)

    # ── Step 1: FTS5 MATCH ────────────────────────────────────────────────────
    try:
        fts_sql = f"""
            SELECT f.id
            FROM file_fts
            JOIN files f ON file_fts.file_id = f.id
            WHERE file_fts MATCH :query
              AND {where_sql}
            ORDER BY bm25(file_fts)   -- bm25() returns negatives; lower = better match
            LIMIT :limit OFFSET :offset
        """
        rows = db.execute(text(fts_sql), params).fetchall()
        file_ids = [row.id for row in rows]

        if file_ids:
            # Preserve BM25 ordering by loading ORM objects in the same order
            id_to_file = {
                f.id: f
                for f in db.query(File).filter(File.id.in_(file_ids)).all()
            }
            results = [
                _file_to_dict(id_to_file[fid])
                for fid in file_ids
                if fid in id_to_file
            ]
            return results, False

        # FTS5 returned zero rows — fall through to LIKE fallback
        raise ValueError("FTS5 returned no rows; trying LIKE fallback")

    except Exception as e:
        logger.warning(
            "FTS5 search failed or empty (query=%r), falling back to filename LIKE: %s",
            q, e,
        )

    # ── Step 2: LIKE fallback ────────────────────────────────────────
    try:
        from sqlalchemy import or_
        q_obj = db.query(File).filter(File.filename.ilike(f"%{q}%"))
        
        all_allowed_roots = set(shared_root_ids + owned_root_ids)
        if all_allowed_roots:
            q_obj = q_obj.filter(
                or_(
                    File.owner_id == user_id,
                    File.mapped_root_id.in_(all_allowed_roots),
                )
            )
        else:
            q_obj = q_obj.filter(File.owner_id == user_id)
        if file_type:
            q_obj = q_obj.filter(File.file_type == file_type)
        if db_node_id:
            q_obj = q_obj.filter(File.node_id == db_node_id)

        files = q_obj.order_by(File.filename).offset(offset).limit(limit).all()
        return [_file_to_dict(f) for f in files], False

    except Exception as e:
        logger.error("LIKE fallback also failed for query=%r: %s", q, e)
        return [], False
