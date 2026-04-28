from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class CacheKey(Base):
    __tablename__ = "cache_keys"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String, ForeignKey("files.id"), nullable=False)
    node_id = Column(String, ForeignKey("nodes.id"), nullable=False)
    encrypted_key = Column(String, nullable=False)  # AES key, encrypted at rest
    issued_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)

    file = relationship("File", back_populates="cache_keys")
    node = relationship("Node", back_populates="cache_keys")
