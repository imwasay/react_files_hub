from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from database import get_db_dep
from middleware.auth_middleware import get_current_user
from models.user import User
from models.file import File
from services.search_service import semantic_search, filename_search, ask_llm

router = APIRouter()


@router.get("")
async def search(
    q: str,
    type: str = "semantic",
    file_type: Optional[str] = None,
    node_id: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    if type == "filename":
        results, llm_available = filename_search(db, user.id, q, file_type, node_id, page, limit)
    else:
        results, llm_available = await semantic_search(db, user.id, q, file_type, node_id, page, limit)

    return {"results": results, "total": len(results), "llm_available": llm_available}


class AskRequest(BaseModel):
    q: str
    file_ids: Optional[List[str]] = None


@router.post("/ask")
async def ask(
    body: AskRequest,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    result = await ask_llm(db, user.id, body.q, body.file_ids)
    if result is None:
        raise HTTPException(status_code=503, detail="llm_unavailable")
    return result
