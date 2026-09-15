import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.core.database import get_db
from app.core.security import require_role
from app.models.declaration import Declaration, DeclarationStatus
from app.models.user import User
from app.services.declaration_service import run_pipeline_bg

router = APIRouter()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/jpg", "application/pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@router.post("/upload", status_code=202, summary="Upload a CIPL document for AI processing")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    doc_name: Optional[str] = Form(None),
    current_user: User = Depends(require_role("admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid file type '{file.content_type}'. Allowed: JPG, PNG, PDF")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Use custom doc_name if provided, otherwise fall back to original filename
    display_name = doc_name.strip() if doc_name and doc_name.strip() else file.filename

    # Create declaration record immediately and return — process in background
    decl_id = uuid.uuid4()
    decl = Declaration(
        id=decl_id,
        filename=display_name,
        file_type=file.content_type,
        status=DeclarationStatus.PROCESSING,
        operator_id=current_user.id,
        session_id=session_id,
    )
    db.add(decl)
    await db.commit()

    background_tasks.add_task(
        run_pipeline_bg,
        str(decl_id), file_bytes, display_name, file.content_type, str(current_user.id)
    )

    return {
        "declaration_id": str(decl_id),
        "status": "processing",
        "filename": file.filename,
        "message": "Document received. Processing in background — connect to WebSocket for live updates.",
    }


@router.post("/upload/batch", status_code=202, summary="Upload multiple CIPL documents for AI processing")
async def upload_documents_batch(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    session_id: Optional[str] = Form(None),
    current_user: User = Depends(require_role("admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    # Validate every file up front — reject the whole batch on the first
    # problem rather than partially creating declarations for a mixed batch.
    file_bytes_list = []
    for f in files:
        if f.content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid file type '{f.content_type}' for '{f.filename}'. Allowed: JPG, PNG, PDF")
        b = await f.read()
        if len(b) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File '{f.filename}' too large (max 10MB)")
        if len(b) == 0:
            raise HTTPException(status_code=400, detail=f"File '{f.filename}' is empty")
        file_bytes_list.append(b)

    declarations = []
    for f, file_bytes in zip(files, file_bytes_list):
        decl_id = uuid.uuid4()
        decl = Declaration(
            id=decl_id,
            filename=f.filename,
            file_type=f.content_type,
            status=DeclarationStatus.PROCESSING,
            operator_id=current_user.id,
            session_id=session_id,
        )
        db.add(decl)
        declarations.append((decl_id, f.filename, f.content_type, file_bytes))

    await db.commit()

    for decl_id, filename, content_type, file_bytes in declarations:
        background_tasks.add_task(
            run_pipeline_bg,
            str(decl_id), file_bytes, filename, content_type, str(current_user.id)
        )

    return {
        "declarations": [
            {"declaration_id": str(decl_id), "filename": filename}
            for decl_id, filename, _, _ in declarations
        ],
        "status": "processing",
        "count": len(declarations),
        "message": "Documents received. Processing in background — connect to WebSocket for live updates on each.",
    }
