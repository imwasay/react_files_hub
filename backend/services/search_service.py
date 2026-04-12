import chromadb
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
import logging

from config import get_settings
from models.file import File
from models.node import Node
from services.llm_service import get_llm_client, is_llm_available

settings = get_settings()
logger = logging.getLogger(__name__)

_chroma_client = None


def _get_chroma():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=settings.vector_store_path)
    return _chroma_client.get_or_create_collection("ntrides_files")


def filename_search(
    db: Session,
    user_id: str,
    q: str,
    file_type: Optional[str],
    node_id: Optional[str],
    page: int,
    limit: int,
) -> Tuple[list, bool]:
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

    files = query.offset((page - 1) * limit).limit(limit).all()
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


async def semantic_search(
    db: Session,
    user_id: str,
    q: str,
    file_type: Optional[str],
    node_id: Optional[str],
    page: int,
    limit: int,
) -> Tuple[list, bool]:
    llm_up = await is_llm_available()

    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(settings.embed_model)
        query_embedding = model.encode(q).tolist()

        collection = _get_chroma()
        where = {"user_id": user_id}
        if file_type:
            where["file_type"] = file_type

        chroma_results = collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            where=where,
        )

        results = []
        for i, doc_id in enumerate(chroma_results["ids"][0]):
            file_id = chroma_results["metadatas"][0][i].get("file_id")
            f = db.query(File).filter(File.id == file_id, File.owner_id == user_id).first()
            if not f:
                continue
            results.append({
                "file_id": f.id,
                "filename": f.filename,
                "logical_path": f.logical_path,
                "snippet": chroma_results["documents"][0][i][:200],
                "score": 1 - chroma_results["distances"][0][i],
                "node_status": f.node.status,
                "file_type": f.file_type,
            })
        return results, llm_up

    except Exception as e:
        logger.warning("Semantic search failed, falling back to filename: %s", e)
        results, _ = filename_search(db, user_id, q, file_type, node_id, page, limit)
        return results, llm_up


async def ask_llm(
    db: Session,
    user_id: str,
    q: str,
    file_ids: Optional[List[str]] = None,
) -> Optional[dict]:
    client = await get_llm_client()
    if not client:
        return None

    # get relevant chunks from vector store
    collection = _get_chroma()
    where = {"user_id": user_id}
    if file_ids:
        where["file_id"] = {"$in": file_ids}

    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(settings.embed_model)
    query_embedding = model.encode(q).tolist()

    chroma_results = collection.query(
        query_embeddings=[query_embedding],
        n_results=5,
        where=where,
    )

    chunks = chroma_results["documents"][0] if chroma_results["documents"] else []
    metas = chroma_results["metadatas"][0] if chroma_results["metadatas"] else []

    if not chunks:
        return {"answer": "No indexed content found for this query.", "sources": [], "llm_model": settings.llm_model}

    context = "\n\n".join(chunks)
    prompt = f"Answer this question using only the provided context.\n\nContext:\n{context}\n\nQuestion: {q}"

    response = await client.post(
        "/api/generate",
        json={"model": settings.llm_model, "prompt": prompt, "stream": False},
        timeout=60,
    )
    answer = response.json().get("response", "")

    sources = []
    for meta in metas:
        file_id = meta.get("file_id")
        f = db.query(File).filter(File.id == file_id).first()
        if f:
            sources.append({"file_id": f.id, "filename": f.filename, "chunk": meta.get("chunk_index")})

    return {"answer": answer, "sources": sources, "llm_model": settings.llm_model}
