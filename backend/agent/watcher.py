import asyncio
import httpx
import logging
import mimetypes
import os
import hashlib
from datetime import datetime
from pathlib import Path

from config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

FEDERATION_TOKEN = os.environ.get("FEDERATION_TOKEN", "")

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


async def _push_changes(changes: list):
    if not changes:
        return
    try:
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
    """On startup, scan all mapped roots and push full state."""
    changes = []
    for root_path in settings.mapped_roots_list:
        logical_name = Path(root_path).name
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
                logical_name = Path(root_path).name
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
