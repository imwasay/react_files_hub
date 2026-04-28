import asyncio
import httpx
import logging
import os
import json
from pathlib import Path
from typing import List

from config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

FEDERATION_TOKEN = os.environ.get("FEDERATION_TOKEN", "")
SUPPORTED_TYPES = {"document", "image"}
CHUNK_SIZE = 512  # tokens approx

_embed_model_instance = None

def _get_embed_model():
    global _embed_model_instance
    if _embed_model_instance is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading embedding model %s into memory...", settings.embed_model)
        _embed_model_instance = SentenceTransformer(settings.embed_model, trust_remote_code=True)
    return _embed_model_instance


def _extract_text(real_path: str, file_type: str, mime_type: str) -> str:
    try:
        if mime_type == "application/pdf":
            import pdfplumber
            with pdfplumber.open(real_path) as pdf:
                return "\n".join(p.extract_text() or "" for p in pdf.pages)

        if mime_type.startswith("text/"):
            with open(real_path, "r", errors="ignore") as f:
                return f.read()

        if file_type == "image":
            import pytesseract
            from PIL import Image
            return pytesseract.image_to_string(Image.open(real_path))

        if "word" in mime_type or "officedocument" in mime_type:
            import docx
            doc = docx.Document(real_path)
            return "\n".join(p.text for p in doc.paragraphs)

    except Exception as e:
        logger.warning("Text extraction failed for %s: %s", real_path, e)
    return ""


def _chunk_text(text: str) -> List[str]:
    words = text.split()
    chunks = []
    for i in range(0, len(words), CHUNK_SIZE):
        chunk = " ".join(words[i:i + CHUNK_SIZE])
        if chunk.strip():
            chunks.append(chunk)
    return chunks


def _embed_chunks(chunks: List[str]) -> List[List[float]]:
    model = _get_embed_model()
    return model.encode(chunks).tolist()


async def _get_local_or_dir_url() -> str:
    """Return the base URL for the ingest endpoints.

    On the Directory Node (self), hit localhost directly rather than going via
    the external contact list (which may not be reachable from inside Docker).
    """
    if settings.is_directory:
        return "http://localhost:8000"
    # Storage node — find the directory node
    from agent.heartbeat import _get_dir_url
    return await _get_dir_url()


def _make_self_federation_token() -> str:
    """Generate a short-lived federation JWT for the self-node calling its own endpoints."""
    from jose import jwt as _jwt
    from datetime import datetime, timedelta
    node_id = settings.self_node_id or settings.node_id or "self"
    exp = datetime.utcnow() + timedelta(hours=1)
    return _jwt.encode({"node_id": node_id, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def _get_federation_token() -> str:
    if settings.is_directory and settings.self_node_id:
        return _make_self_federation_token()
    return FEDERATION_TOKEN


async def _push_vectors(file_id: str, chunks: List[str], embeddings: List[List[float]]):
    url = await _get_local_or_dir_url()
    payload = {
        "file_id": file_id,
        "chunks": [
            {"index": i, "text": c, "embedding": embeddings[i]}
            for i, c in enumerate(chunks)
        ],
    }
    async with httpx.AsyncClient(timeout=60) as client:
        await client.post(
            f"{url}/api/v1/ingest/push-vectors",
            json=payload,
            headers={"X-Federation-Token": _get_federation_token()},
        )


async def _report_status(file_id: str, status: str, reason: str = ""):
    url = await _get_local_or_dir_url()
    async with httpx.AsyncClient(timeout=10) as client:
        await client.patch(
            f"{url}/api/v1/ingest/status",
            json={"file_id": file_id, "status": status, "reason": reason},
            headers={"X-Federation-Token": _get_federation_token()},
        )


async def ingest_file(file_id: str, real_path: str, file_type: str, mime_type: str):
    if file_type not in SUPPORTED_TYPES and not mime_type.startswith("text/"):
        await _report_status(file_id, "skipped", "unsupported type")
        return

    text = await asyncio.get_event_loop().run_in_executor(
        None, _extract_text, real_path, file_type, mime_type
    )

    if not text.strip():
        await _report_status(file_id, "skipped", "no extractable text")
        return

    chunks = _chunk_text(text)
    embeddings = await asyncio.get_event_loop().run_in_executor(None, _embed_chunks, chunks)

    try:
        await _push_vectors(file_id, chunks, embeddings)
        await _report_status(file_id, "indexed")
        logger.info("Ingested %s — %d chunks", real_path, len(chunks))
    except Exception as e:
        await _report_status(file_id, "failed", str(e))
        logger.error("Ingestion push failed for %s: %s", file_id, e)


async def process_queue():
    """Process files queued for ingestion from the ingest_queue directory."""
    queue_path = settings.ingestion_queue_path
    os.makedirs(queue_path, exist_ok=True)

    async def _loop():
        while True:
            for fname in os.listdir(queue_path):
                if not fname.endswith(".json"):
                    continue
                job_path = os.path.join(queue_path, fname)
                try:
                    with open(job_path) as f:
                        job = json.load(f)
                    await ingest_file(
                        job["file_id"],
                        job["real_path"],
                        job.get("file_type", "document"),
                        job.get("mime_type", "text/plain"),
                    )
                    os.remove(job_path)
                except Exception as e:
                    logger.error("Queue job failed %s: %s", fname, e)
            await asyncio.sleep(10)

    asyncio.create_task(_loop())
