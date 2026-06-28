from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from app.core.database import get_db
from app.models.qr_session import QRSession
from app.services.declaration_service import process_document
from app.api.routes.ws import notify_scan_complete
import uuid, secrets, logging

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/jpg", "application/pdf"}

@router.post("/scan/session", summary="Create a QR scan session for mobile upload")
async def create_scan_session(
    db: AsyncSession = Depends(get_db),
):
    token = secrets.token_urlsafe(24)
    session = QRSession(
        token=token,
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(session)
    await db.commit()
    return {
        "token": token,
        "scan_url": f"/scan/{token}",
        "expires_in_minutes": 10,
    }

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
    return {
        "token": session.token,
        "status": session.status,
        "declaration_id": session.declaration_id,
    }

@router.post("/scan/upload/{token}", summary="Mobile uploads captured photo via QR session")
async def scan_upload(
    token: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(QRSession).where(QRSession.token == token))
    session = result.scalar_one_or_none()
    if not session or session.status != "pending":
        raise HTTPException(status_code=400, detail="Invalid or already used session")
    if datetime.now(timezone.utc) > session.expires_at:
        raise HTTPException(status_code=410, detail="Session expired")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Process through full pipeline (no user auth needed — token is the auth)
    decl = await process_document(
        file_bytes=file_bytes,
        filename=file.filename,
        content_type=file.content_type,
        db=db,
        operator_id=None,
        session_id=token,
    )

    session.declaration_id = str(decl.id)
    session.status = "uploaded"
    await db.commit()

    # Notify desktop via WebSocket
    await notify_scan_complete(token, str(decl.id))

    return {"declaration_id": str(decl.id), "status": "processed"}
