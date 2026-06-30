from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from uuid import UUID
from app.models.declaration import DeclarationStatus, DocumentType

class FieldValue(BaseModel):
    value: Optional[Any] = None
    confidence: float = 0.0

class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] = []
    warnings: list[str] = []
    flagged_fields: list[str] = []
    score: int = 0

class DeclarationResponse(BaseModel):
    id: UUID
    filename: str
    file_type: Optional[str]
    status: DeclarationStatus
    document_type: Optional[DocumentType]

    hs_code: Optional[str]
    consignee: Optional[str]
    npwp_consignee: Optional[str]
    declared_value: Optional[float]
    currency: Optional[str]
    quantity: Optional[float]
    unit: Optional[str]
    description: Optional[str]
    country_of_origin: Optional[str]
    gross_weight: Optional[float]
    net_weight: Optional[float]
    shipper: Optional[str]
    bl_number: Optional[str]
    invoice_number: Optional[str]
    invoice_date: Optional[str]
    port_of_loading: Optional[str]
    port_of_discharge: Optional[str]
    port_of_transit: Optional[str]
    vessel_name: Optional[str]
    voyage_number: Optional[str]
    fob_value: Optional[float]
    freight_value: Optional[float]
    cif_value: Optional[float]
    cif_idr: Optional[float]
    package_quantity: Optional[int]
    package_type: Optional[str]
    container_marks: Optional[str]
    bc11_number: Optional[str]

    llm_extracted: Optional[dict]
    ai_insight: Optional[dict]
    validation_result: Optional[dict]
    ceisa_response: Optional[dict]
    processing_time_ms: Optional[float]
    operator_id: Optional[UUID]
    operator_name: Optional[str] = None
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class DeclarationListItem(BaseModel):
    id: UUID
    filename: str
    status: DeclarationStatus
    document_type: Optional[DocumentType]
    hs_code: Optional[str]
    consignee: Optional[str]
    declared_value: Optional[float]
    currency: Optional[str]
    processing_time_ms: Optional[float]
    operator_id: Optional[UUID] = None
    operator_name: Optional[str] = None
    created_at: Optional[datetime]

    class Config:
        from_attributes = True

class DeclarationUpdate(BaseModel):
    hs_code: Optional[str] = None
    consignee: Optional[str] = None
    npwp_consignee: Optional[str] = None
    declared_value: Optional[float] = None
    currency: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    country_of_origin: Optional[str] = None
    gross_weight: Optional[float] = None
    net_weight: Optional[float] = None
    shipper: Optional[str] = None
    bl_number: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    port_of_loading: Optional[str] = None
    port_of_discharge: Optional[str] = None
    port_of_transit: Optional[str] = None
    vessel_name: Optional[str] = None
    voyage_number: Optional[str] = None
    fob_value: Optional[float] = None
    freight_value: Optional[float] = None
    cif_value: Optional[float] = None
    cif_idr: Optional[float] = None
    exchange_rate: Optional[float] = None
    package_quantity: Optional[int] = None
    package_type: Optional[str] = None
    container_marks: Optional[str] = None
    bc11_number: Optional[str] = None
    notes: Optional[str] = None
