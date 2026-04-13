from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from datetime import datetime

from config import get_settings
from database import get_db_dep
from models.user import User

settings = get_settings()
bearer = HTTPBearer()


def verify_jwt(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"],
        )
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


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
# from fastapi import Depends, HTTPException, status
# from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
# from sqlalchemy.orm import Session
# from jose import jwt, JWTError
# from datetime import datetime

# from config import get_settings
# from database import get_db_dep
# from models.user import User

# settings = get_settings()
# bearer = HTTPBearer()


# def verify_jwt(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
#     try:
#         payload = jwt.decode(
#             credentials.credentials,
#             settings.jwt_secret,
#             algorithms=["HS256"],
#         )
#         return payload
#     except JWTError:
#         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# def get_current_user(
#     payload: dict = Depends(verify_jwt),
#     db: Session = Depends(get_db_dep),
# ) -> User:
#     user = db.query(User).filter(User.id == payload.get("sub")).first()
#     if not user:
#         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
#     user.last_seen = datetime.utcnow()
#     return user


# def require_admin(user: User = Depends(get_current_user)) -> User:
#     if user.role != "admin":
#         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
#     return user
