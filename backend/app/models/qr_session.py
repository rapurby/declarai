from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid

class QRSession(Base):
    __tablename__ = "qr_sessions"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token            = Column(String, unique=True, nullable=False, index=True)
    desktop_ws_id    = Column(String, nullable=True)  # WebSocket connection ID for desktop
    declaration_id   = Column(String, nullable=True)  # filled after mobile uploads
    status           = Column(String, default="pending")  # pending | uploaded | expired
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    expires_at       = Column(DateTime(timezone=True), nullable=False)
