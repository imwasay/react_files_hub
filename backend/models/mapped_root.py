from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class MappedRoot(Base):
    __tablename__ = "mapped_roots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    node_id = Column(String, ForeignKey("nodes.id"), nullable=False)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    logical_name = Column(String, nullable=False)
    real_path = Column(String, nullable=False)
    is_media_library = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    node = relationship("Node", back_populates="mapped_roots")
    files = relationship("File", back_populates="mapped_root")
