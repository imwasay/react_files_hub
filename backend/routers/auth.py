from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from jose import jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import uuid

from config import get_settings
from database import get_db_dep
from models.user import User
from middleware.auth_middleware import get_current_user

router = APIRouter()
settings = get_settings()
pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def _make_access_token(user_id: str, role: str) -> str:
    exp = datetime.utcnow() + timedelta(hours=settings.jwt_expiry_hours)
    return jwt.encode({"sub": user_id, "role": role, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def _make_refresh_token(user_id: str) -> str:
    exp = datetime.utcnow() + timedelta(days=30)
    return jwt.encode({"sub": user_id, "type": "refresh", "exp": exp}, settings.jwt_secret, algorithm="HS256")


@router.post("/register", status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db_dep)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        id=str(uuid.uuid4()),
        username=body.username,
        email=body.email,
        password_hash=pwd.hash(body.password),
        role="viewer",
    )
    db.add(user)
    return {"user_id": user.id, "username": user.username, "role": user.role}


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db_dep)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not pwd.verify(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user.last_seen = datetime.utcnow()
    return {
        "access_token": _make_access_token(user.id, user.role),
        "refresh_token": _make_refresh_token(user.id),
        "expires_in": settings.jwt_expiry_hours * 3600,
    }


@router.post("/refresh")
def refresh(body: dict, db: Session = Depends(get_db_dep)):
    try:
        payload = jwt.decode(body.get("refresh_token", ""), settings.jwt_secret, algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=400, detail="Not a refresh token")
        user = db.query(User).filter(User.id == payload["sub"]).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {
            "access_token": _make_access_token(user.id, user.role),
            "expires_in": settings.jwt_expiry_hours * 3600,
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "last_seen": user.last_seen,
    }
