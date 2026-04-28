from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from datetime import datetime
from typing import Optional

from config import get_settings
from database import get_db_dep
from models.user import User

settings = get_settings()
bearer = HTTPBearer(auto_error=False)  # Don't auto-error — we check query param fallback


def verify_jwt(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    """Extract and verify JWT from Authorization header or ?token= query param.

    Browser-native elements (<img>, <video>, <a download>) can't set
    Authorization headers, so we accept the token as a query parameter
    for streaming/thumbnail/subtitle endpoints.
    """
    token = None

    # 1. Try Authorization header first
    if credentials and credentials.credentials:
        token = credentials.credentials

    # 2. Fallback: ?token= query parameter
    if not token:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


def get_current_user(
    payload: dict = Depends(verify_jwt),
    db: Session = Depends(get_db_dep),
) -> User:
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    user.last_seen = datetime.utcnow()
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    # owner role has full admin access — bootstrapped admin user has role="owner"
    if user.role not in ("admin", "owner"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user
