import time, logging, uuid, os, asyncio
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.declaration import Declaration, DeclarationStatus, DocumentType
from app.models.audit import AuditLog
from app.ocr.engine import run_ocr, ocr_to_plain_text
from app.llm.extractor import extract_fields
from app.validator.ceisa_rules import validate
from app.ceisa.formatter import format_for_ceisa
from app.ceisa.gateway import submit_to_ceisa
from app.core.config import settings
from app.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=4)

os.makedirs(settings.FILE_STORAGE_PATH, exist_ok=True)

def _save_file(file_bytes: bytes, filename: str, declaration_id: str) -> str:
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    path = os.path.join(settings.FILE_STORAGE_PATH, f"{declaration_id}.{ext}")
    with open(path, "wb") as f:
        f.write(file_bytes)
    return path

def _gv(extracted: dict, f: str):
    return (extracted.get(f) or {}).get("value")

def _gf(extracted: dict, f: str):
    v = _gv(extracted, f)
    if v is None: return None
    try:
        return float(str(v).replace(',', '').replace('RP', '').replace('USD', '').replace('IDR', '').strip())
    except (ValueError, TypeError): return None

def _gi(extracted: dict, f: str):
    v = _gv(extracted, f)
    if v is None: return None
    try:
        return int(str(v).replace(',', '').strip())
    except (ValueError, TypeError): return None

async def _broadcast(declaration_id: str, data: dict):
    try:
        from app.api.routes.ws import broadcast_status
        await broadcast_status(str(declaration_id), data)
    except Exception as e:
        logger.debug(f"WS broadcast skipped: {e}")

async def run_pipeline_bg(
    declaration_id: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    operator_id: str = None,
):
    """Background processing pipeline — runs independently per declaration."""
    start = time.time()
    loop = asyncio.get_event_loop()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Declaration).where(Declaration.id == declaration_id))
        decl = result.scalar_one_or_none()
        if not decl:
            logger.error(f"Declaration {declaration_id} not found for background processing")
            return

        try:
            # Stage 1 — Save file
            file_path = _save_file(file_bytes, filename, declaration_id)
            decl.file_path = file_path

            # Stage 2 — OCR (run in thread to avoid blocking event loop)
            await _broadcast(declaration_id, {"type": "stage", "stage": "ocr", "label": "Processing OCR..."})
            ocr_results = await loop.run_in_executor(_executor, run_ocr, file_bytes, content_type)
            ocr_text = ocr_to_plain_text(ocr_results)
            decl.ocr_raw = ocr_results
            decl.status = DeclarationStatus.EXTRACTED
            await db.commit()

            # Stage 3 — LLM extraction + insight (single API call)
            await _broadcast(declaration_id, {"type": "stage", "stage": "llm", "label": "Extracting document information..."})
            raw = await loop.run_in_executor(_executor, extract_fields, ocr_text)

            header = raw.get("header", raw)
            line_items = raw.get("line_items", [])
            insight = raw.get("insight", {})

            decl.llm_extracted = raw
            decl.line_items = line_items
            decl.ai_insight = insight

            doc_type_val = _gv(header, "document_type") or "unknown"
            try:
                decl.document_type = DocumentType(doc_type_val)
            except ValueError:
                decl.document_type = DocumentType.UNKNOWN

            decl.consignee         = _gv(header, "consignee")
            decl.npwp_consignee    = _gv(header, "npwp_consignee")
            decl.shipper           = _gv(header, "shipper")
            decl.invoice_number    = _gv(header, "invoice_number")
            decl.invoice_date      = _gv(header, "invoice_date")
            decl.currency          = _gv(header, "currency")
            decl.declared_value    = _gf(header, "declared_value")
            decl.fob_value         = _gf(header, "fob_value")
            decl.freight_value     = _gf(header, "freight_value")
            decl.cif_value         = _gf(header, "cif_value")
            decl.gross_weight      = _gf(header, "gross_weight")
            decl.net_weight        = _gf(header, "net_weight")
            decl.country_of_origin = _gv(header, "country_of_origin")
            decl.bl_number         = _gv(header, "bl_number")
            decl.vessel_name       = _gv(header, "vessel_name")
            decl.voyage_number     = _gv(header, "voyage_number")
            decl.port_of_loading   = _gv(header, "port_of_loading")
            decl.port_of_discharge = _gv(header, "port_of_discharge")
            decl.port_of_transit   = _gv(header, "port_of_transit")
            decl.package_quantity  = _gi(header, "package_quantity")
            decl.package_type      = _gv(header, "package_type")
            decl.container_marks   = _gv(header, "container_marks")
            decl.bc11_number       = _gv(header, "bc11_number")

            # Use first line item for legacy single-item fields
            if line_items:
                first = line_items[0]
                decl.hs_code     = first.get("hs_code")
                decl.quantity    = first.get("quantity")
                decl.unit        = first.get("unit")
                decl.description = first.get("description")

            # Stage 4 — Validate
            await _broadcast(declaration_id, {"type": "stage", "stage": "validate", "label": "Validating extracted data..."})
            validation = validate(header)
            decl.validation_result = validation
            decl.status = DeclarationStatus.VALIDATED if validation["valid"] else DeclarationStatus.FLAGGED
            decl.processing_time_ms = round((time.time() - start) * 1000, 2)
            await db.commit()
            await db.refresh(decl)

            await _broadcast(declaration_id, {
                "type": "complete",
                "declaration_id": declaration_id,
                "status": decl.status.value,
                "score": validation.get("score"),
                "processing_time_ms": decl.processing_time_ms,
            })
            logger.info(f"✅ Declaration {declaration_id} done in {decl.processing_time_ms}ms")

        except Exception as e:
            decl.status = DeclarationStatus.REJECTED
            decl.notes = str(e)
            await db.commit()
            await _broadcast(declaration_id, {"type": "error", "message": str(e)})
            logger.error(f"❌ Pipeline error for {declaration_id}: {e}")

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
    total      = await db.scalar(select(func.count(Declaration.id)))
    accepted   = await db.scalar(select(func.count(Declaration.id)).where(Declaration.status == DeclarationStatus.ACCEPTED))
    flagged    = await db.scalar(select(func.count(Declaration.id)).where(Declaration.status == DeclarationStatus.FLAGGED))
    rejected   = await db.scalar(select(func.count(Declaration.id)).where(Declaration.status == DeclarationStatus.REJECTED))
    processing = await db.scalar(select(func.count(Declaration.id)).where(Declaration.status == DeclarationStatus.PROCESSING))
    validated  = await db.scalar(select(func.count(Declaration.id)).where(Declaration.status == DeclarationStatus.VALIDATED))
    avg_time   = await db.scalar(select(func.avg(Declaration.processing_time_ms)).where(Declaration.processing_time_ms.isnot(None)))

    # Full breakdown across every status (Uploaded/Processing/Extracted/
    # Validated/Flagged/Submitted/Accepted/Rejected) — used by the dashboard's
    # Status Distribution chart, which previously only rendered 3 of the 8
    # statuses (Accepted/Flagged/Rejected), so e.g. Validated never showed up.
    by_status = {}
    for s in DeclarationStatus:
        count = await db.scalar(select(func.count(Declaration.id)).where(Declaration.status == s))
        by_status[s.value] = count or 0

    return {
        "total":             total or 0,
        "accepted":          accepted or 0,
        "flagged":           flagged or 0,
        "rejected":          rejected or 0,
        "processing":        processing or 0,
        "waiting_review":    (flagged or 0) + (validated or 0),
        "avg_processing_ms": round(avg_time or 0, 2),
        "success_rate":      round((accepted / total * 100) if total else 0, 1),
        "by_status":         by_status,
    }
