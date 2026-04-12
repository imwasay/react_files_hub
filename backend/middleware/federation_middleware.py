from fastapi import Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from typing import Optional

from config import get_settings
from database import get_db_dep
from models.node import Node

settings = get_settings()


def verify_federation_token(
    x_federation_token: Optional[str] = Header(None),
    db: Session = Depends(get_db_dep),
) -> Node:
    if not x_federation_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing federation token")
    try:
        payload = jwt.decode(x_federation_token, settings.jwt_secret, algorithms=["HS256"])
        node_id = payload.get("node_id")
        if not node_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid federation token")
        node = db.query(Node).filter(Node.node_id == node_id).first()
        if not node:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unknown node")
        return node
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid federation token")
