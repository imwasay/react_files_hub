"""Media metadata endpoint — audio tracks, subtitles, next/prev episode.

Used by the video player to display controls for subtitle selection,
audio track switching, and episode navigation.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
import os
import subprocess
import json
import logging

from database import get_db_dep
from models.file import File
from models.share import Share
from models.user import User
from middleware.auth_middleware import get_current_user
from config import get_settings

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

SUBTITLE_DIR = "/data/subtitles"


def _ensure_subtitle_dir():
    os.makedirs(SUBTITLE_DIR, exist_ok=True)


def _visible_file(file_id: str, db: Session, user: User) -> Optional[File]:
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


# ── ffprobe helpers ────────────────────────────────────────────────────────────

def _ffprobe_streams(real_path: str, stream_type: str) -> list[dict]:
    """Run ffprobe and return stream info for given type (a=audio, s=subtitle, v=video)."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", stream_type,
                "-show_entries", "stream=index,codec_name,codec_type,channels,sample_rate,bit_rate,width,height:stream_tags=language,title",
                "-of", "json",
                real_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
        )
        data = json.loads(result.stdout)
        return data.get("streams", [])
    except Exception as e:
        logger.warning("ffprobe failed for %s: %s", real_path, e)
        return []


def _ffprobe_duration(real_path: str) -> Optional[float]:
    """Get duration in seconds."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "json",
                real_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
        )
        data = json.loads(result.stdout)
        dur = data.get("format", {}).get("duration")
        return float(dur) if dur else None
    except Exception:
        return None


# ── subtitle helpers ───────────────────────────────────────────────────────────

def _find_external_srt(real_path: str) -> Optional[str]:
    """Find .srt file alongside the video."""
    base, _ = os.path.splitext(real_path)
    for ext in (".srt", ".SRT", ".Srt"):
        srt = base + ext
        if os.path.isfile(srt):
            return srt
    return None


def _convert_srt_to_vtt(srt_path: str) -> Optional[str]:
    """Convert SRT → VTT. Cached."""
    _ensure_subtitle_dir()
    basename = os.path.basename(srt_path).rsplit(".", 1)[0] + ".vtt"
    vtt_path = os.path.join(SUBTITLE_DIR, basename)

    if os.path.isfile(vtt_path):
        return vtt_path

    try:
        for enc in ("utf-8", "utf-8-sig", "iso-8859-1", "cp1252"):
            try:
                with open(srt_path, "r", encoding=enc) as f:
                    content = f.read()
                break
            except (UnicodeDecodeError, UnicodeError):
                continue
        else:
            return None

        # SRT uses commas in timestamps; VTT uses periods
        content = content.replace(",", ".")
        with open(vtt_path, "w", encoding="utf-8") as f:
            f.write("WEBVTT\n\n" + content)
        return vtt_path
    except Exception as e:
        logger.warning("SRT→VTT conversion failed: %s", e)
        return None


def _extract_embedded_subtitle(real_path: str, stream_index: int, lang: str) -> Optional[str]:
    """Extract embedded text subtitle to VTT."""
    _ensure_subtitle_dir()
    basename = f"{os.path.basename(real_path).rsplit('.', 1)[0]}_{lang}_{stream_index}.vtt"
    vtt_path = os.path.join(SUBTITLE_DIR, basename)

    if os.path.isfile(vtt_path):
        return vtt_path

    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", real_path,
                "-map", f"0:{stream_index}",
                "-f", "webvtt", vtt_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
        )
        if result.returncode == 0 and os.path.isfile(vtt_path):
            return vtt_path
    except Exception as e:
        logger.warning("Subtitle extraction failed: %s", e)

    return None


# ── routes ─────────────────────────────────────────────────────────────────────

@router.get("/{file_id}/media-info")
def media_info(
    file_id: str,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    """Return media metadata: audio tracks, subtitles, next/prev episode, duration."""
    f = _visible_file(file_id, db, user)
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    result = {
        "file_id": f.id,
        "filename": f.filename,
        "file_type": f.file_type,
        "mime_type": f.mime_type,
        "audio_tracks": [],
        "embedded_subtitles": [],
        "external_subtitles": [],
        "next_episode": None,
        "prev_episode": None,
        "duration_seconds": None,
    }

    is_local = settings.self_node_id and f.node.node_id == settings.self_node_id
    is_media = f.file_type in ("video", "audio")

    # ── ffprobe data (only for local files) ────────────────────────────────
    if is_local and is_media and os.path.isfile(f.real_path):
        # Audio tracks
        audio_streams = _ffprobe_streams(f.real_path, "a")
        for idx, s in enumerate(audio_streams):
            tags = s.get("tags", {})
            codec = s.get("codec_name", "unknown")

            # Known browser-incompatible codecs
            browser_compat = codec.lower() in (
                "aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le", "pcm_f32le",
            )
            result["audio_tracks"].append({
                "index": s.get("index", idx),
                "display_index": idx,
                "language": tags.get("language", "und"),
                "title": tags.get("title", f"Track {idx + 1}"),
                "codec": codec,
                "channels": s.get("channels"),
                "browser_compatible": browser_compat,
            })

        # Embedded subtitles
        sub_streams = _ffprobe_streams(f.real_path, "s")
        text_codecs = {"subrip", "ass", "ssa", "webvtt", "mov_text", "srt", "text"}
        for s in sub_streams:
            codec = s.get("codec_name", "unknown")
            if codec in text_codecs:
                tags = s.get("tags", {})
                lang = tags.get("language", "und")
                result["embedded_subtitles"].append({
                    "index": s.get("index"),
                    "language": lang,
                    "title": tags.get("title", lang.upper()),
                    "codec": codec,
                })

        # External .srt
        srt = _find_external_srt(f.real_path)
        if srt:
            result["external_subtitles"].append({
                "index": 0,
                "language": "ext",
                "title": "External SRT",
                "source": "srt",
            })

        # Duration
        result["duration_seconds"] = _ffprobe_duration(f.real_path)

    # ── Next / previous episode ────────────────────────────────────────────
    if f.file_type in ("video", "audio"):
        # Find siblings in the same folder (same logical_path prefix)
        folder_path = "/".join(f.logical_path.split("/")[:-1])
        if folder_path:
            siblings = (
                db.query(File)
                .filter(
                    File.mapped_root_id == f.mapped_root_id,
                    File.file_type == f.file_type,
                    File.logical_path.like(f"{folder_path}/%"),
                )
                .order_by(File.filename.asc())
                .all()
            )
            # Filter to only direct children (no deeper nesting)
            siblings = [
                s for s in siblings
                if s.logical_path.count("/") == f.logical_path.count("/")
            ]
            for i, s in enumerate(siblings):
                if s.id == f.id:
                    if i > 0:
                        result["prev_episode"] = {
                            "file_id": siblings[i - 1].id,
                            "filename": siblings[i - 1].filename,
                        }
                    if i < len(siblings) - 1:
                        result["next_episode"] = {
                            "file_id": siblings[i + 1].id,
                            "filename": siblings[i + 1].filename,
                        }
                    break

    return result


@router.get("/{file_id}/subtitle/{sub_index}")
def get_subtitle(
    file_id: str,
    sub_index: int,
    source: str = "embedded",  # "embedded" or "external"
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    """Serve a subtitle track as VTT."""
    f = _visible_file(file_id, db, user)
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    if not (settings.self_node_id and f.node.node_id == settings.self_node_id):
        raise HTTPException(status_code=404, detail="Subtitles only for local files")

    if not os.path.isfile(f.real_path):
        raise HTTPException(status_code=404, detail="Source file not found on disk")

    vtt_path = None

    if source == "external":
        srt = _find_external_srt(f.real_path)
        if srt:
            vtt_path = _convert_srt_to_vtt(srt)
    else:
        # Extract embedded subtitle at the given stream index
        # First, verify the stream index exists
        sub_streams = _ffprobe_streams(f.real_path, "s")
        text_codecs = {"subrip", "ass", "ssa", "webvtt", "mov_text", "srt", "text"}
        target = None
        for s in sub_streams:
            if s.get("index") == sub_index and s.get("codec_name") in text_codecs:
                target = s
                break
        if target:
            lang = target.get("tags", {}).get("language", "und")
            vtt_path = _extract_embedded_subtitle(f.real_path, sub_index, lang)

    if not vtt_path or not os.path.isfile(vtt_path):
        raise HTTPException(status_code=404, detail="Subtitle track not available")

    return Response(
        content=open(vtt_path, "r", encoding="utf-8").read(),
        media_type="text/vtt; charset=utf-8",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Disposition": f'inline; filename="{os.path.basename(vtt_path)}"',
        },
    )
