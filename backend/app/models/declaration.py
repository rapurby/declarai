from sqlalchemy import Column, String, Float, DateTime, JSON, Text, Integer
from sqlalchemy import Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum
import uuid


class DeclarationStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    EXTRACTED = "extracted"
    VALIDATED = "validated"
    FLAGGED = "flagged"
    SUBMITTED = "submitted"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class DocumentType(str, enum.Enum):
    INVOICE = "invoice"
    PACKING_LIST = "packing_list"
    BILL_OF_LADING = "bill_of_lading"
    UNKNOWN = "unknown"


class Declaration(Base):
    __tablename__ = "declarations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=True)
    file_path = Column(String, nullable=True)

    status = Column(
        SAEnum(DeclarationStatus),
        default=DeclarationStatus.UPLOADED,
        index=True,
    )

    document_type = Column(
        SAEnum(DocumentType),
        default=DocumentType.UNKNOWN,
        nullable=True,
    )

    operator_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    session_id = Column(String, nullable=True, index=True)

    # ==============================
    # Relationships
    # ==============================

    operator = relationship(
        "User",
        foreign_keys=[operator_id],
        lazy="selectin",
    )

    items = relationship(
        "DeclarationItem",
        back_populates="declaration",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def operator_name(self):
        return self.operator.full_name if self.operator else None

    # ==============================
    # Core CEISA Fields
    # ==============================

    hs_code = Column(String, nullable=True)

    consignee = Column(String, nullable=True)

    npwp_consignee = Column(String, nullable=True)

    declared_value = Column(Float, nullable=True)

    currency = Column(String, nullable=True)

    quantity = Column(Float, nullable=True)

    unit = Column(String, nullable=True)

    description = Column(Text, nullable=True)

    country_of_origin = Column(String, nullable=True)

    gross_weight = Column(Float, nullable=True)

    net_weight = Column(Float, nullable=True)

    # ==============================
    # Shipping
    # ==============================

    shipper = Column(String, nullable=True)

    bl_number = Column(String, nullable=True)

    invoice_number = Column(String, nullable=True)

    invoice_date = Column(String, nullable=True)

    port_of_loading = Column(String, nullable=True)

    port_of_discharge = Column(String, nullable=True)

    port_of_transit = Column(String, nullable=True)

    vessel_name = Column(String, nullable=True)

    voyage_number = Column(String, nullable=True)

    # ==============================
    # Financial
    # ==============================

    fob_value = Column(Float, nullable=True)

    freight_value = Column(Float, nullable=True)

    cif_value = Column(Float, nullable=True)

    cif_idr = Column(Float, nullable=True)

    exchange_rate = Column(Float, nullable=True)

    # ==============================
    # Packaging
    # ==============================

    package_quantity = Column(Integer, nullable=True)

    package_type = Column(String, nullable=True)

    container_marks = Column(String, nullable=True)

    bc11_number = Column(String, nullable=True)

    # sementara tetap dipertahankan supaya tidak merusak code lama
    line_items = Column(JSON, nullable=True)

    # ==============================
    # Pipeline
    # ==============================

    ocr_raw = Column(JSON, nullable=True)

    llm_extracted = Column(JSON, nullable=True)

    ai_insight = Column(JSON, nullable=True)

    validation_result = Column(JSON, nullable=True)

    ceisa_payload = Column(JSON, nullable=True)

    ceisa_response = Column(JSON, nullable=True)

    processing_time_ms = Column(Float, nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime(timezone=True),
        onupdate=func.now(),
    )
