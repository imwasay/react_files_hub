from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from database import get_db_dep
from middleware.auth_middleware import get_current_user
from models.user import User
from services.search_service import search_files

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
    # Route all requests to our FTS5 search function
    results, llm_available = search_files(db, user.id, q, file_type, node_id, page, limit)
    return {"results": results, "total": len(results), "llm_available": False}


class AskRequest(BaseModel):
    q: str
    file_ids: Optional[List[str]] = None


@router.post("/ask")
async def ask(
    body: AskRequest,
    db: Session = Depends(get_db_dep),
    user: User = Depends(get_current_user),
):
    # Dummy response to prevent frontend crashes since LLM features were removed
    # The frontend is robust enough to handle 501 gracefully per user instructions.
    from fastapi import HTTPException
    raise HTTPException(status_code=501, detail="AI search is currently disabled.")
