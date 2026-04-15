"""Thumbnail generation and serving for images and videos.

Thumbnails are generated on first request and cached to /data/thumbnails/.
- Images: PIL resize to fit 400×300, JPEG 75%
- Videos: ffmpeg grabs a frame at ~5 seconds, scales to 400px wide
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional
import os
import subprocess
import hashlib
import logging

from database import get_db_dep
from models.file import File
from models.user import User
from middleware.auth_middleware import get_current_user
from config import get_settings

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

THUMB_DIR = "/data/thumbnails"
THUMB_MAX_W = 400
THUMB_MAX_H = 300
THUMB_QUALITY = 75
VIDEO_SEEK_SEC = 5


def _ensure_thumb_dir():
    os.makedirs(THUMB_DIR, exist_ok=True)


def _thumb_path(file_id: str) -> str:
    return os.path.join(THUMB_DIR, f"{file_id}.jpg")


def _generate_image_thumbnail(source: str, dest: str) -> bool:
    """Generate a JPEG thumbnail from an image file using PIL."""
    try:
        from PIL import Image

        img = Image.open(source)
        # Handle rotation from EXIF
        try:
            from PIL import ExifTags
            for orientation in ExifTags.TAGS.keys():
                if ExifTags.TAGS[orientation] == "Orientation":
                    break
            exif = img._getexif()  # noqa
            if exif and orientation in exif:
                if exif[orientation] == 3:
                    img = img.rotate(180, expand=True)
                elif exif[orientation] == 6:
                    img = img.rotate(270, expand=True)
                elif exif[orientation] == 8:
                    img = img.rotate(90, expand=True)
        except (AttributeError, KeyError, IndexError, TypeError):
            pass

        img.thumbnail((THUMB_MAX_W, THUMB_MAX_H))
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        img.save(dest, "JPEG", quality=THUMB_QUALITY, optimize=True)
        return True
    except Exception as e:
        logger.warning("Image thumbnail generation failed for %s: %s", source, e)
        return False


def _generate_video_thumbnail(source: str, dest: str) -> bool:
    """Generate a JPEG thumbnail from a video using ffmpeg."""
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-ss", str(VIDEO_SEEK_SEC),
                "-i", source,
                "-frames:v", "1",
                "-vf", f"scale={THUMB_MAX_W}:-1",
                "-q:v", "3",
                dest,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
        )
        if result.returncode == 0 and os.path.isfile(dest) and os.path.getsize(dest) > 0:
            return True

        # Retry seeking to 0 for very short videos
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-ss", "0",
                "-i", source,
                "-frames:v", "1",
                "-vf", f"scale={THUMB_MAX_W}:-1",
                "-q:v", "3",
                dest,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
        )
        return result.returncode == 0 and os.path.isfile(dest) and os.path.getsize(dest) > 0

    except subprocess.TimeoutExpired:
        logger.warning("Video thumbnail generation timed out for %s", source)
        return False
    except Exception as e:
        logger.warning("Video thumbnail generation failed for %s: %s", source, e)
        return False


@router.get("/{file_id}/thumbnail")
def get_thumbnail(
    file_id: str,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    """Return a JPEG thumbnail for the file. Generated on first request."""
    from sqlalchemy import or_
    from models.share import Share

    # Access check (same logic as files.py)
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
    f = (
        db.query(File)
        .filter(
            File.id == file_id,
            or_(
                File.owner_id == user.id,
                File.mapped_root_id.in_(shared_root_ids),
            ),
        )
        .first()
    )
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    if f.file_type not in ("image", "video"):
        raise HTTPException(status_code=404, detail="Thumbnails only for images and videos")

    # Check if self-node file (direct FS access)
    if not (settings.self_node_id and f.node.node_id == settings.self_node_id):
        raise HTTPException(
            status_code=404,
            detail="Thumbnails only available for locally-mounted files"
        )

    if not os.path.isfile(f.real_path):
        raise HTTPException(status_code=404, detail="Source file not found on disk")

    _ensure_thumb_dir()
    thumb = _thumb_path(file_id)

    # Serve from cache
    if os.path.isfile(thumb):
        return FileResponse(
            thumb,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    # Generate
    ok = False
    if f.file_type == "image":
        ok = _generate_image_thumbnail(f.real_path, thumb)
    elif f.file_type == "video":
        ok = _generate_video_thumbnail(f.real_path, thumb)

    if not ok:
        raise HTTPException(status_code=500, detail="Thumbnail generation failed")

    return FileResponse(
        thumb,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )
