from sqlalchemy import Column, String, BigInteger, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class FileCache(Base):
    __tablename__ = "file_cache"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String, ForeignKey("files.id"), nullable=False)
    cached_on_node_id = Column(String, ForeignKey("nodes.id"), nullable=False)
    encrypted_path = Column(String, nullable=False)  # path on caching node's disk
    checksum = Column(String, nullable=False)
    size_bytes = Column(BigInteger, default=0)
    cached_at = Column(DateTime, server_default=func.now())
    last_served_at = Column(DateTime)

    file = relationship("File", back_populates="cache_entries")
    cached_on_node = relationship("Node", back_populates="cache_entries")


class NodeCacheConfig(Base):
    __tablename__ = "node_cache_config"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    node_id = Column(String, ForeignKey("nodes.id"), nullable=False, unique=True)
    budget_bytes = Column(BigInteger, default=10 * 1024 ** 3)  # 10GB default
    used_bytes = Column(BigInteger, default=0)
    eviction_policy = Column(String, default="lru")  # lru | lfu

    node = relationship("Node", back_populates="cache_config")
