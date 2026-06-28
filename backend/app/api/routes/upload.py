from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from app.core.database import get_db
from app.core.security import require_role
from app.schemas.declaration import DeclarationResponse
from app.services.declaration_service import process_document
from app.models.user import User

router = APIRouter()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/jpg", "application/pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@router.post("/upload", response_model=DeclarationResponse, status_code=201,
             summary="Upload a CIPL document for AI processing")
async def upload_document(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
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

    return await process_document(
        file_bytes=file_bytes,
        filename=file.filename,
        content_type=file.content_type,
        db=db,
        operator_id=str(current_user.id),
        session_id=session_id,
    )

@router.post("/upload/batch", response_model=List[DeclarationResponse], status_code=201,
             summary="Upload multiple CIPL documents (same declaration session)")
async def upload_batch(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(require_role("admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid
    session_id = str(_uuid.uuid4())
    results = []
    for file in files:
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid file type for '{file.filename}'")
        file_bytes = await file.read()
        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File '{file.filename}' too large")
        decl = await process_document(
            file_bytes=file_bytes,
            filename=file.filename,
            content_type=file.content_type,
            db=db,
            operator_id=str(current_user.id),
            session_id=session_id,
        )
        results.append(decl)
    return results
