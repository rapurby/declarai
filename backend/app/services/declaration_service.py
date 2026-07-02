import time, logging, uuid, os, asyncio
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from app.models.declaration import Declaration, DeclarationStatus, DocumentType
from app.models.declaration_item import DeclarationItem
from app.models.audit import AuditLog
from app.ocr.engine import run_ocr, ocr_to_plain_text
from app.llm.extractor import extract_fields
from app.validator.ceisa_rules import validate
from app.ceisa.formatter import format_for_ceisa
from app.ceisa.gateway import submit_to_ceisa
from app.core.config import settings
from app.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)
# Reduced from 4 -> 2: each OCR job can itself spawn up to 2 onnxruntime
# threads (see app/ocr/engine.py), so 4 concurrent executor slots could mean
# up to 8 CPU threads fighting at once on a small instance — exactly what
# caused other users' requests to lag whenever someone uploaded. 2 slots
# keeps a predictable CPU budget while still letting 2 declarations process
# in parallel.
_executor = ThreadPoolExecutor(max_workers=2)

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

            # Save every detected item into declaration_item table.
            # (Single insert block — do NOT duplicate this.)
            await db.execute(
                DeclarationItem.__table__.delete().where(
                    DeclarationItem.declaration_id == decl.id
                )
            )

            for item in line_items:
                db.add(
                    DeclarationItem(
                        declaration_id=decl.id,
                        item_no=item.get("no"),
                        hs_code=item.get("hs_code"),
                        description=item.get("description"),
                        quantity=item.get("quantity"),
                        unit=item.get("unit"),
                        unit_price=item.get("unit_price"),
                        total_value=item.get("total_value"),
                        country_of_origin=item.get("country_of_origin"),
                        confidence=item.get("confidence"),
                    )
                )

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

            # -------------------------------------------------
            # Legacy fields (tetap isi dari item pertama agar
            # frontend lama tetap kompatibel)
            # -------------------------------------------------
            if line_items:
                first = line_items[0]

                decl.hs_code = first.get("hs_code")
                decl.quantity = first.get("quantity")
                decl.unit = first.get("unit")
                decl.description = first.get("description")

            # Semua item sudah disimpan ke tabel declaration_item
            # pada blok di atas, jadi tidak perlu insert lagi.

            # Stage 4 — Validate
            await _broadcast(declaration_id, {"type": "stage", "stage": "validate", "label": "Validating extracted data..."})
            validation = validate(header, line_items)
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

    # formatter otomatis unwrap struktur nested {header, line_items, insight}
    # dan membuat satu entri "goods" per line item
    payload = format_for_ceisa(decl.llm_extracted or {}, decl.id, decl.line_items)
    decl.ceisa_payload = payload
    ceisa_resp = await submit_to_ceisa(payload)
    decl.ceisa_response = ceisa_resp

    # H2H "ACCEPTED" = acknowledgment "kami terima", bukan "lolos bea cukai".
    # Status CDP pindah ke SUBMITTED sampai CEISA kirim callback accept/reject.
    if ceisa_resp.get("status") in ("ACCEPTED", "RECEIVED"):
        decl.status = DeclarationStatus.SUBMITTED
    else:
        decl.status = DeclarationStatus.REJECTED

    await db.commit()
    await db.refresh(decl)
    return decl

async def get_dashboard_stats(db: AsyncSession, operator_id: str = None) -> dict:
    """
    Dashboard stats. When `operator_id` is given (operator role), every
    count is scoped to declarations THAT operator uploaded — this is each
    operator's personal KPI view, not the org-wide total. Admin/Viewer call
    this with operator_id=None to get the full org-wide picture.
    """
    if operator_id and isinstance(operator_id, str):
        # Cast to a real UUID object rather than comparing against the raw
        # string — asyncpg/Postgres tolerates a string here, but the UUID
        # column's type decorator needs an actual uuid.UUID instance to bind
        # correctly on every dialect (this also matches how get_current_user
        # already handles the JWT "sub" claim elsewhere in the codebase).
        import uuid as _uuid
        operator_id = _uuid.UUID(operator_id)

    base = select(func.count(Declaration.id))
    if operator_id:
        base = base.where(Declaration.operator_id == operator_id)

    def scoped(extra_where=None):
        q = base
        if extra_where is not None:
            q = q.where(extra_where)
        return q

    total      = await db.scalar(scoped())
    accepted   = await db.scalar(scoped(Declaration.status == DeclarationStatus.ACCEPTED))
    flagged    = await db.scalar(scoped(Declaration.status == DeclarationStatus.FLAGGED))
    rejected   = await db.scalar(scoped(Declaration.status == DeclarationStatus.REJECTED))
    processing = await db.scalar(scoped(Declaration.status == DeclarationStatus.PROCESSING))
    validated  = await db.scalar(scoped(Declaration.status == DeclarationStatus.VALIDATED))

    avg_q = select(func.avg(Declaration.processing_time_ms)).where(Declaration.processing_time_ms.isnot(None))
    if operator_id:
        avg_q = avg_q.where(Declaration.operator_id == operator_id)
    avg_time = await db.scalar(avg_q)

    # Full breakdown across every status (Uploaded/Processing/Extracted/
    # Validated/Flagged/Submitted/Accepted/Rejected) — used by the dashboard's
    # Status Distribution chart, which previously only rendered 3 of the 8
    # statuses (Accepted/Flagged/Rejected), so e.g. Validated never showed up.
    by_status = {}
    for s in DeclarationStatus:
        count = await db.scalar(scoped(Declaration.status == s))
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
        "scope":             "personal" if operator_id else "organization",
    }
