from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    declaration_id = Column(UUID(as_uuid=True), ForeignKey("declarations.id", ondelete="CASCADE"), nullable=False, index=True)
    operator_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    field_name     = Column(String, nullable=False)
    old_value      = Column(Text, nullable=True)
    new_value      = Column(Text, nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
