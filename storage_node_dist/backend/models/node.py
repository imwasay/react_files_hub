from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class Node(Base):
    __tablename__ = "nodes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    node_id = Column(String, unique=True, nullable=False, index=True)
    subdomain = Column(String, unique=True)
    node_ip = Column(String)
    ipv6 = Column(String)
    ipv4 = Column(String)
    host_os = Column(String, default="linux")
    status = Column(String, default="offline")  # online | offline | degraded
    last_seen = Column(DateTime)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    owner = relationship("User", back_populates="nodes")
    files = relationship("File", back_populates="node")
    mapped_roots = relationship("MappedRoot", back_populates="node")
    cache_entries = relationship("FileCache", back_populates="cached_on_node")
    cache_keys = relationship("CacheKey", back_populates="node")
    cache_config = relationship("NodeCacheConfig", back_populates="node", uselist=False)
