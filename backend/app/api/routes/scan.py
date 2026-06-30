import uuid, secrets, logging
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from app.core.database import get_db
from app.models.qr_session import QRSession
from app.models.declaration import Declaration, DeclarationStatus
from app.services.declaration_service import run_pipeline_bg
from app.api.routes.ws import notify_scan_complete
from app.core.database import AsyncSessionLocal
from app.ocr.engine import run_ocr, ocr_to_plain_text

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/jpg", "application/pdf"}

@router.post("/scan/session", summary="Create a QR scan session for mobile upload")
async def create_scan_session(db: AsyncSession = Depends(get_db)):
    token = secrets.token_urlsafe(24)
    session = QRSession(
        token=token,
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(session)
    await db.commit()
    return {"token": token, "scan_url": f"/scan/{token}", "expires_in_minutes": 10}

@router.get("/scan/session/{token}", summary="Check scan session status")
async def get_scan_session(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(QRSession).where(QRSession.token == token))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if datetime.now(timezone.utc) > session.expires_at:
        session.status = "expired"
        await db.commit()
        raise HTTPException(status_code=410, detail="Session expired")
    return {"token": session.token, "status": session.status, "declaration_id": session.declaration_id}

@router.post("/scan/upload/{token}", summary="Mobile uploads captured photo(s) via QR session")
async def scan_upload(
    token: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    doc_name: Optional[str] = Form(default=""),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(QRSession).where(QRSession.token == token))
    session = result.scalar_one_or_none()
    if not session or session.status != "pending":
        raise HTTPException(status_code=400, detail="Invalid or already used session")
    if datetime.now(timezone.utc) > session.expires_at:
        raise HTTPException(status_code=410, detail="Session expired")
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    for f in files:
        if f.content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid file type: {f.content_type}")

    all_bytes, all_types = [], []
    for f in files:
        b = await f.read()
        if len(b) == 0:
            raise HTTPException(status_code=400, detail="Empty file received")
        all_bytes.append(b)
        all_types.append(f.content_type)

    # Determine filename
    filename = doc_name.strip() if doc_name and doc_name.strip() else None
    if not filename:
        filename = files[0].filename or "scan.jpg"
    elif "." not in filename:
        ext = files[0].filename.rsplit(".", 1)[-1] if "." in (files[0].filename or "") else "jpg"
        filename = f"{filename}.{ext}"

    # Create declaration immediately
    decl_id = uuid.uuid4()
    decl = Declaration(
        id=decl_id,
        filename=filename,
        file_type=all_types[0],
        status=DeclarationStatus.PROCESSING,
        session_id=token,
    )
    db.add(decl)
    session.declaration_id = str(decl_id)
    session.status = "uploaded"
    await db.commit()

    # Notify desktop that upload was received (starts showing live stages)
    await notify_scan_complete(token, str(decl_id))

    # Process in background — independent per user
    if len(all_bytes) > 1:
        background_tasks.add_task(run_pipeline_multipage_bg, str(decl_id), all_bytes, all_types, filename)
    else:
        background_tasks.add_task(run_pipeline_bg, str(decl_id), all_bytes[0], filename, all_types[0], None)

    return {"declaration_id": str(decl_id), "status": "processing", "pages": len(files)}


async def run_pipeline_multipage_bg(declaration_id: str, pages_bytes: list, pages_types: list, filename: str):
    """OCR all pages, combine text, single LLM extraction."""
    import asyncio, os, time
    from concurrent.futures import ThreadPoolExecutor
    from app.llm.extractor import extract_fields
    from app.validator.ceisa_rules import validate as _validate
    from app.services.declaration_service import _gv, _gf, _gi, _broadcast, log_audit
    from app.models.declaration import DocumentType, DeclarationStatus
    from app.core.config import settings

    loop = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=2)
    start = time.time()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Declaration).where(Declaration.id == declaration_id))
        decl = result.scalar_one_or_none()
        if not decl:
            return
        try:
            all_ocr, all_text = [], []
            for i, (fb, ft) in enumerate(zip(pages_bytes, pages_types)):
                await _broadcast(declaration_id, {"type": "stage", "stage": "ocr", "label": f"OCR page {i+1}/{len(pages_bytes)}..."})
                ocr = await loop.run_in_executor(executor, run_ocr, fb, ft)
                all_ocr.extend(ocr)
                all_text.append(ocr_to_plain_text(ocr))

            combined = "\n\n--- PAGE BREAK ---\n\n".join(all_text)
            decl.ocr_raw = all_ocr

            os.makedirs(settings.FILE_STORAGE_PATH, exist_ok=True)
            ext = filename.rsplit(".", 1)[-1] if "." in filename else "jpg"
            path = os.path.join(settings.FILE_STORAGE_PATH, f"{declaration_id}.{ext}")
            with open(path, "wb") as fh:
                fh.write(pages_bytes[0])
            decl.file_path = path

            await _broadcast(declaration_id, {"type": "stage", "stage": "llm", "label": "Extracting document information..."})
            raw = await loop.run_in_executor(executor, extract_fields, combined)
            header = raw.get("header", raw)
            line_items = raw.get("line_items", [])

            decl.llm_extracted = raw
            decl.line_items = line_items
            decl.ai_insight = raw.get("insight", {})

            try:
                decl.document_type = DocumentType(_gv(header, "document_type") or "unknown")
            except ValueError:
                decl.document_type = DocumentType.UNKNOWN

            decl.consignee = _gv(header, "consignee")
            decl.shipper = _gv(header, "shipper")
            decl.invoice_number = _gv(header, "invoice_number")
            decl.invoice_date = _gv(header, "invoice_date")
            decl.currency = _gv(header, "currency")
            decl.declared_value = _gf(header, "declared_value")
            decl.fob_value = _gf(header, "fob_value")
            decl.freight_value = _gf(header, "freight_value")
            decl.cif_value = _gf(header, "cif_value")
            decl.gross_weight = _gf(header, "gross_weight")
            decl.net_weight = _gf(header, "net_weight")
            decl.country_of_origin = _gv(header, "country_of_origin")
            decl.bl_number = _gv(header, "bl_number")
            decl.port_of_loading = _gv(header, "port_of_loading")
            decl.port_of_discharge = _gv(header, "port_of_discharge")
            decl.package_quantity = _gi(header, "package_quantity")
            decl.package_type = _gv(header, "package_type")

            if line_items:
                first = line_items[0]
                decl.hs_code = first.get("hs_code")
                decl.quantity = first.get("quantity")
                decl.unit = first.get("unit")
                decl.description = first.get("description")

            await _broadcast(declaration_id, {"type": "stage", "stage": "validate", "label": "Validating extracted data..."})
            validation = _validate(header)
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
        except Exception as e:
            decl.status = DeclarationStatus.REJECTED
            decl.notes = str(e)
            await db.commit()
            await _broadcast(declaration_id, {"type": "error", "message": str(e)})
            logger.error(f"Multi-page pipeline error {declaration_id}: {e}")
