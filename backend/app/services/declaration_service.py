import time, logging, uuid, os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.declaration import Declaration, DeclarationStatus, DocumentType
from app.models.audit import AuditLog
from app.ocr.engine import run_ocr, ocr_to_plain_text
from app.llm.extractor import extract_fields
from app.llm.insight import generate_insight
from app.validator.ceisa_rules import validate
from app.ceisa.formatter import format_for_ceisa
from app.ceisa.gateway import submit_to_ceisa
from app.core.config import settings

logger = logging.getLogger(__name__)

# Ensure upload dir exists
os.makedirs(settings.FILE_STORAGE_PATH, exist_ok=True)

def _save_file(file_bytes: bytes, filename: str, declaration_id: str) -> str:
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    path = os.path.join(settings.FILE_STORAGE_PATH, f"{declaration_id}.{ext}")
    with open(path, "wb") as f:
        f.write(file_bytes)
    return path

async def process_document(
    file_bytes: bytes,
    filename: str,
    content_type: str,
    db: AsyncSession,
    operator_id: str = None,
    session_id: str = None,
) -> Declaration:
    start = time.time()

    decl = Declaration(
        id=uuid.uuid4(),
        filename=filename,
        file_type=content_type,
        status=DeclarationStatus.PROCESSING,
        operator_id=operator_id,
        session_id=session_id,
    )
    db.add(decl)
    await db.commit()

    try:
        # Save original file
        file_path = _save_file(file_bytes, filename, str(decl.id))
        decl.file_path = file_path

        # Stage 1+2: OCR
        ocr_results = run_ocr(file_bytes, content_type)
        ocr_text = ocr_to_plain_text(ocr_results)
        decl.ocr_raw = ocr_results
        decl.status = DeclarationStatus.EXTRACTED
        await db.commit()

        # Stage 3: LLM Extraction
        extracted = extract_fields(ocr_text)
        decl.llm_extracted = extracted

        def gv(f): return (extracted.get(f) or {}).get("value")

        def gf(f):
            """Get value as float, stripping currency symbols and commas."""
            v = gv(f)
            if v is None: return None
            try:
                return float(str(v).replace(',', '').replace('RP', '').replace('USD', '').replace('IDR', '').strip())
            except (ValueError, TypeError): return None

        def gi(f):
            """Get value as int."""
            v = gv(f)
            if v is None: return None
            try:
                return int(str(v).replace(',', '').strip())
            except (ValueError, TypeError): return None

        # Document type
        doc_type_val = gv("document_type") or "unknown"
        try:
            decl.document_type = DocumentType(doc_type_val)
        except ValueError:
            decl.document_type = DocumentType.UNKNOWN

        # Map all fields
        decl.hs_code           = gv("hs_code")
        decl.consignee         = gv("consignee")
        decl.npwp_consignee    = gv("npwp_consignee")
        decl.declared_value    = gf("declared_value")
        decl.currency          = gv("currency")
        decl.quantity          = gf("quantity")
        decl.unit              = gv("unit")
        decl.description       = gv("description")
        decl.country_of_origin = gv("country_of_origin")
        decl.gross_weight      = gf("gross_weight")
        decl.net_weight        = gf("net_weight")
        decl.shipper           = gv("shipper")
        decl.bl_number         = gv("bl_number")
        decl.invoice_number    = gv("invoice_number")
        decl.invoice_date      = gv("invoice_date")
        decl.port_of_loading   = gv("port_of_loading")
        decl.port_of_discharge = gv("port_of_discharge")
        decl.port_of_transit   = gv("port_of_transit")
        decl.vessel_name       = gv("vessel_name")
        decl.voyage_number     = gv("voyage_number")
        decl.fob_value         = gf("fob_value")
        decl.freight_value     = gf("freight_value")
        decl.cif_value         = gf("cif_value")
        decl.package_quantity  = gi("package_quantity")
        decl.package_type      = gv("package_type")
        decl.container_marks   = gv("container_marks")
        decl.bc11_number       = gv("bc11_number")

        # Stage 4: Validate
        validation = validate(extracted)
        decl.validation_result = validation

        # Stage 5: AI Insight
        insight = generate_insight(extracted, validation)
        decl.ai_insight = insight

        decl.status = DeclarationStatus.VALIDATED if validation["valid"] else DeclarationStatus.FLAGGED
        decl.processing_time_ms = round((time.time() - start) * 1000, 2)

        await db.commit()
        await db.refresh(decl)
        logger.info(f"✅ Declaration {decl.id} processed in {decl.processing_time_ms}ms")
        return decl

    except Exception as e:
        decl.status = DeclarationStatus.REJECTED
        decl.notes = str(e)
        await db.commit()
        logger.error(f"❌ Pipeline error for {decl.id}: {e}")
        raise

async def log_audit(db: AsyncSession, declaration_id, operator_id, changes: dict):
    for field, (old_val, new_val) in changes.items():
        entry = AuditLog(
            declaration_id=declaration_id,
            operator_id=operator_id,
            field_name=field,
            old_value=str(old_val) if old_val is not None else None,
            new_value=str(new_val) if new_val is not None else None,
        )
        db.add(entry)
    await db.commit()

async def submit_declaration(declaration_id: str, db: AsyncSession) -> Declaration:
    result = await db.execute(select(Declaration).where(Declaration.id == declaration_id))
    decl = result.scalar_one_or_none()
    if not decl:
        raise ValueError("Declaration not found")
    if decl.status not in [DeclarationStatus.VALIDATED]:
        raise ValueError(f"Cannot submit declaration with status '{decl.status}'")

    payload = format_for_ceisa(decl.llm_extracted or {}, decl.id)
    decl.ceisa_payload = payload
    ceisa_resp = await submit_to_ceisa(payload)
    decl.ceisa_response = ceisa_resp

    if ceisa_resp.get("status") == "ACCEPTED":
        decl.status = DeclarationStatus.ACCEPTED
    else:
        decl.status = DeclarationStatus.REJECTED

    await db.commit()
    await db.refresh(decl)
    return decl

async def get_dashboard_stats(db: AsyncSession) -> dict:
    total    = await db.scalar(select(func.count(Declaration.id)))
    accepted = await db.scalar(select(func.count(Declaration.id)).where(Declaration.status == DeclarationStatus.ACCEPTED))
    flagged  = await db.scalar(select(func.count(Declaration.id)).where(Declaration.status == DeclarationStatus.FLAGGED))
    rejected = await db.scalar(select(func.count(Declaration.id)).where(Declaration.status == DeclarationStatus.REJECTED))
    avg_time = await db.scalar(select(func.avg(Declaration.processing_time_ms)).where(Declaration.processing_time_ms.isnot(None)))

    return {
        "total":             total or 0,
        "accepted":          accepted or 0,
        "flagged":           flagged or 0,
        "rejected":          rejected or 0,
        "avg_processing_ms": round(avg_time or 0, 2),
        "success_rate":      round((accepted / total * 100) if total else 0, 1),
    }
