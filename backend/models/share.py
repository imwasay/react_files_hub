from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class Share(Base):
    __tablename__ = "shares"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String, ForeignKey("files.id"), nullable=True)
    mapped_root_id = Column(String, ForeignKey("mapped_roots.id"), nullable=True)
    granted_by = Column(String, ForeignKey("users.id"), nullable=False)
    granted_to = Column(String, ForeignKey("users.id"), nullable=True)  # null = public
    access_level = Column(String, default="read")
    token = Column(String, unique=True, nullable=False, index=True)
    is_public = Column(Boolean, default=False)
    allow_reshare = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    file = relationship("File", back_populates="shares")
    granter = relationship("User", foreign_keys=[granted_by], back_populates="shares_granted")
    grantee = relationship("User", foreign_keys=[granted_to], back_populates="shares_received")
