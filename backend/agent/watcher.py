import asyncio
import logging
import mimetypes
import os
import hashlib
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Used only by storage nodes — directory self-node uses DB directly
import os as _os
FEDERATION_TOKEN = _os.environ.get("FEDERATION_TOKEN", "")

FILE_TYPE_MAP = {
    "video": ["video/"],
    "audio": ["audio/"],
    "image": ["image/"],
    "document": ["application/pdf", "application/msword", "text/", "application/vnd"],
    "archive": ["application/zip", "application/x-tar", "application/x-rar"],
}


def _classify(mime: str) -> str:
    for ftype, prefixes in FILE_TYPE_MAP.items():
        if any(mime.startswith(p) for p in prefixes):
            return ftype
    return "other"


def _checksum(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _build_change(op: str, real_path: str, root_path: str, logical_name: str) -> dict:
    rel = os.path.relpath(real_path, root_path)
    logical = f"{logical_name}/{rel}".replace("\\", "/")
    mime = mimetypes.guess_type(real_path)[0] or "application/octet-stream"
    stat = os.stat(real_path) if op != "delete" else None

    return {
        "op": op,
        "real_path": real_path,
        "logical_path": logical,
        "filename": os.path.basename(real_path),
        "mime_type": mime if op != "delete" else None,
        "file_type": _classify(mime) if op != "delete" else None,
        "size_bytes": stat.st_size if stat else 0,
        "checksum": _checksum(real_path) if op != "delete" else None,
        "modified_at": datetime.utcfromtimestamp(stat.st_mtime).isoformat() if stat else None,
    }


# ── storage node path — pushes via HTTP ──────────────────────────────────────

async def _push_changes(changes: list):
    if not changes:
        return
    try:
        import httpx
        from agent.heartbeat import _get_dir_url
        url = await _get_dir_url()
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{url}/api/v1/files/sync",
                json={"node_id": settings.node_id, "changes": changes},
                headers={"X-Federation-Token": FEDERATION_TOKEN},
            )
            logger.info("Sync pushed %d changes: %s", len(changes), r.status_code)
    except Exception as e:
        logger.warning("Failed to push changes: %s", e)


async def _initial_scan():
    """On startup scan all MAPPED_ROOTS env var paths and push to directory node."""
    changes = []
    for root_path in settings.mapped_roots_list:
        logical_name = root_path  # use full path; dir node rewrites using its registered logical_name
        if not os.path.isdir(root_path):
            logger.warning("Mapped root not found: %s", root_path)
            continue
        for dirpath, _, filenames in os.walk(root_path):
            for fname in filenames:
                full = os.path.join(dirpath, fname)
                try:
                    changes.append(_build_change("add", full, root_path, logical_name))
                except Exception as e:
                    logger.warning("Skipping %s: %s", full, e)
    await _push_changes(changes)


async def start_watcher():
    """Storage node watcher — pushes via HTTP to directory node."""
    await _initial_scan()

    async def _watch():
        from watchfiles import awatch, Change
        paths = [p for p in settings.mapped_roots_list if os.path.isdir(p)]
        if not paths:
            logger.warning("No valid mapped roots to watch")
            return

        debounce = settings.watcher_debounce_ms

        async for batch in awatch(*paths, debounce=debounce):
            changes = []
            for change_type, path in batch:
                root_path = next((r for r in paths if path.startswith(r)), paths[0])
                logical_name = root_path  # use full path; dir node rewrites using its registered logical_name
                try:
                    if change_type == Change.deleted:
                        changes.append({
                            "op": "delete",
                            "real_path": path,
                            "logical_path": "",
                            "filename": os.path.basename(path),
                        })
                    else:
                        op = "add" if change_type == Change.added else "modify"
                        changes.append(_build_change(op, path, root_path, logical_name))
                except Exception as e:
                    logger.warning("Error processing change %s: %s", path, e)

            await _push_changes(changes)

    asyncio.create_task(_watch())


# ── directory self-node path — writes directly to local DB ───────────────────

def _sync_changes_to_db(node_id_str: str, changes: list):
    """Write file changes directly into the local registry DB.

    Used when the Directory Node is watching its own drives — avoids the
    HTTP → federation_token round-trip.
    """
    from database import get_db
    from models.node import Node
    from models.file import File
    from models.mapped_root import MappedRoot

    with get_db() as db:
        node = db.query(Node).filter(Node.node_id == node_id_str).first()
        if not node:
            logger.warning("Self-node '%s' not found in DB — cannot sync.", node_id_str)
            return

        accepted = 0
        for change in changes:
            try:
                if change["op"] == "delete":
                    f = db.query(File).filter(
                        File.node_id == node.id,
                        File.real_path == change["real_path"],
                    ).first()
                    if f:
                        db.delete(f)
                    accepted += 1
                    continue

                f = db.query(File).filter(
                    File.node_id == node.id,
                    File.real_path == change["real_path"],
                ).first()

                # find best matching mapped root by longest real_path prefix match
                root = None
                best_len = -1
                for r in db.query(MappedRoot).filter(MappedRoot.node_id == node.id).all():
                    if change["real_path"].startswith(r.real_path) and len(r.real_path) > best_len:
                        root = r
                        best_len = len(r.real_path)

                if not root:
                    logger.debug("No mapped root for %s — skipping", change["real_path"])
                    continue

                modified_at = None
                if change.get("modified_at"):
                    try:
                        modified_at = datetime.fromisoformat(change["modified_at"])
                    except (ValueError, TypeError):
                        pass

                if f:
                    f.filename = change["filename"]
                    f.logical_path = change["logical_path"]
                    f.mime_type = change.get("mime_type")
                    f.file_type = change.get("file_type")
                    f.size_bytes = change.get("size_bytes", 0)
                    f.checksum = change.get("checksum")
                    f.modified_at = modified_at
                    f.index_status = "pending"
                else:
                    f = File(
                        id=str(uuid.uuid4()),
                        node_id=node.id,
                        mapped_root_id=root.id,
                        owner_id=node.owner_id,
                        logical_path=change["logical_path"],
                        real_path=change["real_path"],
                        filename=change["filename"],
                        mime_type=change.get("mime_type"),
                        file_type=change.get("file_type"),
                        size_bytes=change.get("size_bytes", 0),
                        checksum=change.get("checksum"),
                        modified_at=modified_at,
                        index_status="pending",
                    )
                    db.add(f)

                accepted += 1
            except Exception as e:
                logger.warning("DB sync failed for %s: %s", change.get("real_path"), e)

        logger.info("Self-node DB sync: %d files processed.", accepted)


async def _initial_scan_self_node(node_id_str: str, root_path: Optional[str] = None):
    """Scan mapped roots registered in DB for the self-node and write directly to DB.

    If root_path is given, scan only that root (used after adding a new mapped root).
    Otherwise scan all mapped roots registered to the self-node.
    """
    from database import get_db
    from models.node import Node
    from models.mapped_root import MappedRoot

    with get_db() as db:
        node = db.query(Node).filter(Node.node_id == node_id_str).first()
        if not node:
            logger.warning("Self-node '%s' not in DB — cannot scan.", node_id_str)
            return

        if root_path:
            roots = db.query(MappedRoot).filter(
                MappedRoot.node_id == node.id,
                MappedRoot.real_path == root_path,
            ).all()
        else:
            roots = db.query(MappedRoot).filter(MappedRoot.node_id == node.id).all()

        all_roots_data = [(r.real_path, r.logical_name) for r in roots]

    def _do_scan():
        """Run the full scan synchronously — called in a thread executor."""
        changes = []
        for rp, logical_name in all_roots_data:
            if not os.path.isdir(rp):
                logger.warning("Mapped root path not a directory: %s", rp)
                continue
            logger.info("Scanning %s ...", rp)
            for dirpath, _, filenames in os.walk(rp):
                for fname in filenames:
                    full = os.path.join(dirpath, fname)
                    try:
                        changes.append(_build_change("add", full, rp, logical_name))
                    except Exception as e:
                        logger.warning("Skipping %s: %s", full, e)
        if changes:
            logger.info("Self-node scan: found %d files, writing to DB...", len(changes))
            _sync_changes_to_db(node_id_str, changes)
        else:
            logger.info("Self-node scan: no files found.")

    # Run the entire scan in a thread so it doesn't block the event loop
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _do_scan)


async def start_watcher_self_node():
    """Directory self-node watcher — writes directly to local DB.

    Runs initial scan of all mapped roots registered in the DB, then watches
    for filesystem changes and updates the DB directly.
    """
    node_id_str = settings.self_node_id
    if not node_id_str:
        logger.info("SELF_NODE_ID not set — self-node watcher skipped.")
        return

    # Initial scan of all registered mapped roots
    await _initial_scan_self_node(node_id_str)

    async def _watch():
        from watchfiles import awatch, Change
        from database import get_db
        from models.node import Node
        from models.mapped_root import MappedRoot

        # Reload root paths from DB at watch start
        with get_db() as db:
            node = db.query(Node).filter(Node.node_id == node_id_str).first()
            if not node:
                logger.warning("Self-node not in DB — watcher cannot start.")
                return
            roots_data = [(r.real_path, r.logical_name) for r in node.mapped_roots]

        paths = [rp for rp, _ in roots_data if os.path.isdir(rp)]
        root_map = {rp: ln for rp, ln in roots_data}

        if not paths:
            logger.info("Self-node: no mapped roots with valid paths — watcher idle.")
            return

        logger.info("Self-node watcher active on %d roots.", len(paths))
        debounce = settings.watcher_debounce_ms

        async for batch in awatch(*paths, debounce=debounce):
            changes = []
            for change_type, path in batch:
                root_path = next((r for r in paths if path.startswith(r)), paths[0])
                logical_name = root_map.get(root_path, Path(root_path).name)
                try:
                    if change_type == Change.deleted:
                        changes.append({
                            "op": "delete",
                            "real_path": path,
                            "logical_path": "",
                            "filename": os.path.basename(path),
                        })
                    else:
                        op = "add" if change_type == Change.added else "modify"
                        changes.append(_build_change(op, path, root_path, logical_name))
                except Exception as e:
                    logger.warning("Error processing change %s: %s", path, e)

            if changes:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _sync_changes_to_db, node_id_str, changes)

    asyncio.create_task(_watch())
