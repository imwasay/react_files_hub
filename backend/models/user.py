from sqlalchemy import Column, String, DateTime, func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="viewer")  # owner | viewer | admin
    created_at = Column(DateTime, server_default=func.now())
    last_seen = Column(DateTime)

    nodes = relationship("Node", back_populates="owner", cascade="all, delete-orphan")
    files = relationship("File", back_populates="owner")
    shares_granted = relationship("Share", foreign_keys="Share.granted_by", back_populates="granter")
    shares_received = relationship("Share", foreign_keys="Share.granted_to", back_populates="grantee")
