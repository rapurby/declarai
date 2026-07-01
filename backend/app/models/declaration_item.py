import uuid

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    ForeignKey,
    DateTime,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class DeclarationItem(Base):
    __tablename__ = "declaration_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    declaration_id = Column(
        UUID(as_uuid=True),
        ForeignKey("declarations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    item_no = Column(Integer)

    hs_code = Column(String)

    description = Column(String)

    quantity = Column(Float)

    unit = Column(String)

    unit_price = Column(Float)

    total_value = Column(Float)

    country_of_origin = Column(String)

    confidence = Column(Float)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    declaration = relationship(
        "Declaration",
        back_populates="items"
    )
