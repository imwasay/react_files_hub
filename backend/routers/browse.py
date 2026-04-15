"""Virtual folder-browse endpoint.

Reconstructs a directory hierarchy from the flat `logical_path` stored on
each File row.  The "root" level shows mapped-root logical_names as
top-level folders.  Drilling into a root shows the file-system tree beneath
it (derived purely from string splitting — no real FS access needed).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, case
from typing import Optional
from collections import defaultdict

from database import get_db_dep
from models.file import File
from models.node import Node
from models.mapped_root import MappedRoot
from models.share import Share
from models.user import User
from middleware.auth_middleware import get_current_user

router = APIRouter()


# ── helpers ────────────────────────────────────────────────────────────────────

def _visible_roots(db: Session, user: User):
    """Return MappedRoot IDs the user may browse."""
    shared_root_ids = (
        db.query(Share.mapped_root_id)
        .filter(
            Share.mapped_root_id.isnot(None),
            or_(
                Share.granted_to == user.id,
                Share.is_public == True,  # noqa: E712
            ),
        )
    )
    return (
        db.query(MappedRoot)
        .filter(
            or_(
                MappedRoot.owner_id == user.id,
                MappedRoot.id.in_(shared_root_ids),
            )
        )
        .all()
    )


def _visible_files_q(db: Session, user: User):
    """Base query for files the user may see."""
    shared_root_ids = (
        db.query(Share.mapped_root_id)
        .filter(
            Share.mapped_root_id.isnot(None),
            or_(
                Share.granted_to == user.id,
                Share.is_public == True,  # noqa: E712
            ),
        )
    )
    return db.query(File).filter(
        or_(
            File.owner_id == user.id,
            File.mapped_root_id.in_(shared_root_ids),
        )
    )


# ── routes ─────────────────────────────────────────────────────────────────────

@router.get("")
def browse(
    path: Optional[str] = Query(None, description="Virtual path to browse, e.g. 'Movies/Action'"),
    sort: str = Query("name", description="Sort field: name, size, date, type"),
    order: str = Query("asc", description="Sort order: asc, desc"),
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    """Return the contents of a virtual folder.

    * No path → list accessible mapped roots as top-level folders.
    * path=``RootName`` → list direct children of that root.
    * path=``RootName/sub/folder`` → list children at that depth.
    """

    roots = _visible_roots(db, user)
    root_map = {r.logical_name: r for r in roots}

    # ── Level 0: show mapped roots as folders ──────────────────────────────
    if not path or path.strip() == "":
        items = []
        for r in roots:
            file_count = (
                _visible_files_q(db, user)
                .filter(File.mapped_root_id == r.id)
                .count()
            )
            items.append({
                "name": r.logical_name,
                "type": "folder",
                "path": r.logical_name,
                "item_count": file_count,
                "node_id": r.node.node_id if r.node else None,
                "node_status": r.node.status if r.node else None,
                "root_id": r.id,
            })
        # Sort roots alphabetically
        items.sort(key=lambda x: x["name"].lower())
        return {
            "items": items,
            "current_path": "",
            "parent_path": None,
            "breadcrumbs": [],
        }

    # ── Deeper levels ──────────────────────────────────────────────────────
    parts = [p for p in path.strip("/").split("/") if p]
    root_name = parts[0]
    sub_path = "/".join(parts[1:]) if len(parts) > 1 else ""

    root = root_map.get(root_name)
    if not root:
        return {
            "items": [],
            "current_path": path,
            "parent_path": "" if len(parts) == 1 else "/".join(parts[:-1]),
            "breadcrumbs": _build_breadcrumbs(parts),
            "error": f"Root '{root_name}' not found or not accessible",
        }

    # Get all files under this root
    base_q = _visible_files_q(db, user).filter(File.mapped_root_id == root.id)

    # The logical_path for a file in root "Movies" at sub/folder/movie.mkv
    # is stored as "Movies/sub/folder/movie.mkv".
    # We need to list items at exactly the depth of `path`.
    prefix = path.rstrip("/") + "/"
    depth = len(parts)  # number of path segments already traversed

    # All files whose logical_path starts with our prefix
    candidate_files = base_q.filter(File.logical_path.like(f"{prefix}%")).all()

    folders = defaultdict(lambda: {"count": 0, "total_size": 0})
    direct_files = []

    for f in candidate_files:
        # Strip the prefix to get the relative remainder
        remainder = f.logical_path[len(prefix):]
        remaining_parts = remainder.split("/")

        if len(remaining_parts) == 1:
            # Direct child file
            direct_files.append(f)
        else:
            # Belongs to a subfolder — record the immediate child folder name
            folder_name = remaining_parts[0]
            folders[folder_name]["count"] += 1
            folders[folder_name]["total_size"] += f.size_bytes or 0

    # Build response items
    items = []

    # Folders first
    for fname, info in sorted(folders.items(), key=lambda x: x[0].lower()):
        items.append({
            "name": fname,
            "type": "folder",
            "path": f"{path.rstrip('/')}/{fname}",
            "item_count": info["count"],
            "total_size": info["total_size"],
        })

    # Then files
    for f in direct_files:
        has_thumb = f.file_type in ("image", "video")
        items.append({
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
            "is_cached": len(f.cache_entries) > 0,
            "has_thumbnail": has_thumb,
        })

    # Sort files (folders stay at top)
    file_items = [i for i in items if i["type"] == "file"]
    folder_items = [i for i in items if i["type"] == "folder"]

    reverse = order.lower() == "desc"
    sort_key_map = {
        "name": lambda x: (x.get("name") or "").lower(),
        "size": lambda x: x.get("size_bytes") or x.get("total_size") or 0,
        "date": lambda x: x.get("modified_at") or "",
        "type": lambda x: x.get("file_type") or x.get("type") or "",
    }
    key_fn = sort_key_map.get(sort, sort_key_map["name"])

    folder_items.sort(key=key_fn, reverse=reverse)
    file_items.sort(key=key_fn, reverse=reverse)

    parent = "/".join(parts[:-1]) if len(parts) > 1 else ""

    return {
        "items": folder_items + file_items,
        "current_path": path,
        "parent_path": parent,
        "breadcrumbs": _build_breadcrumbs(parts),
        "root_id": root.id,
        "root_name": root.logical_name,
        "node_id": root.node.node_id if root.node else None,
    }


def _build_breadcrumbs(parts: list[str]) -> list[dict]:
    crumbs = []
    for i, part in enumerate(parts):
        crumbs.append({
            "name": part,
            "path": "/".join(parts[: i + 1]),
        })
    return crumbs
