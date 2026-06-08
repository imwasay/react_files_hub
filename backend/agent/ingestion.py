import asyncio
import logging
import os
from database import SessionLocal
from sqlalchemy import text

logger = logging.getLogger(__name__)

SUPPORTED_TEXT_MIMES = {"text/plain", "text/markdown", "text/csv", "application/json"}


def _extract_text(real_path: str, mime_type: str) -> str:
    """Extract up to ~500 words from a file for FTS5 indexing."""
    try:
        if mime_type == "application/pdf":
            import pdfplumber
            with pdfplumber.open(real_path) as pdf:
                text_content = ""
                for page in pdf.pages:
                    text_content += (page.extract_text() or "") + " "
                    if len(text_content.split()) > 500:
                        break
                return " ".join(text_content.split()[:500])

        if mime_type in SUPPORTED_TEXT_MIMES or mime_type.startswith("text/"):
            with open(real_path, "r", errors="ignore") as f:
                content = f.read(5000) # read first 5000 chars roughly
                return " ".join(content.split()[:500])

    except Exception as e:
        logger.warning("Text extraction failed for %s: %s", real_path, e)
    return ""


def index_file(file_id: str, filename: str, logical_path: str, real_path: str, mime_type: str):
    """Synchronous file indexing function using SQLite FTS5."""
    extracted_text = _extract_text(real_path, mime_type) if mime_type else ""
    
    try:
        with SessionLocal() as db:
            db.execute(text("""
                INSERT OR REPLACE INTO file_fts (file_id, filename, relative_path, mime_type, extracted_text)
                VALUES (:file_id, :filename, :relative_path, :mime_type, :extracted_text)
            """), {
                "file_id": file_id,
                "filename": filename,
                "relative_path": logical_path,
                "mime_type": mime_type or "",
                "extracted_text": extracted_text
            })
            db.commit()
            logger.info("FTS5 Indexed: %s", filename)
    except Exception as e:
        logger.error("Failed to index %s into FTS5: %s", filename, e)


async def ingest_file(*args, **kwargs):
    # Stub for compatibility if anything still calls it dynamically
    pass

async def process_queue():
    # Stub for compatibility to prevent server crash since main.py might import it
    pass
