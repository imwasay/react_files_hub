from sqlalchemy import Column, String, Boolean, BigInteger, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class File(Base):
    __tablename__ = "files"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    node_id = Column(String, ForeignKey("nodes.id"), nullable=False)
    mapped_root_id = Column(String, ForeignKey("mapped_roots.id"), nullable=False)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    logical_path = Column(String, nullable=False, index=True)
    real_path = Column(String, nullable=False)
    filename = Column(String, nullable=False, index=True)
    mime_type = Column(String)
    file_type = Column(String)  # video | audio | image | document | archive | other
    size_bytes = Column(BigInteger, default=0)
    checksum = Column(String)
    index_status = Column(String, default="pending")  # pending|processing|indexed|failed|skipped
    access_count = Column(Integer, default=0)
    last_accessed_at = Column(DateTime)
    modified_at = Column(DateTime)
    indexed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    node = relationship("Node", back_populates="files")
    mapped_root = relationship("MappedRoot", back_populates="files")
    owner = relationship("User", back_populates="files")
    shares = relationship("Share", back_populates="file")
    cache_entries = relationship("FileCache", back_populates="file")
    cache_keys = relationship("CacheKey", back_populates="file")
