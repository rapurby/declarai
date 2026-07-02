from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.core.security import require_role, decode_token
from app.models.declaration import Declaration, DeclarationStatus
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.declaration import DeclarationResponse, DeclarationListItem, DeclarationUpdate
from app.services.declaration_service import submit_declaration, get_dashboard_stats, log_audit
from typing import Optional
import os

_bearer = HTTPBearer(auto_error=False)

router = APIRouter()

@router.get("/declarations", response_model=list[DeclarationListItem])
async def list_declarations(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_role("admin", "operator", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    q = select(Declaration).order_by(desc(Declaration.created_at)).limit(limit).offset(offset)
    if status:
        try:
            q = q.where(Declaration.status == DeclarationStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    # Operators only see their own declarations
    if current_user.role == "operator":
        q = q.where(Declaration.operator_id == current_user.id)
    result = await db.execute(q)
    return result.scalars().all()

@router.get("/declarations/stats", summary="Dashboard statistics — personal totals for Operator, org-wide for Admin/Viewer")
async def dashboard_stats(
    current_user: User = Depends(require_role("admin", "operator", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    operator_id = str(current_user.id) if current_user.role == "operator" else None
    return await get_dashboard_stats(db, operator_id=operator_id)

@router.get("/declarations/{declaration_id}", response_model=DeclarationResponse)
async def get_declaration(
    declaration_id: str,
    current_user: User = Depends(require_role("admin", "operator", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Declaration).where(Declaration.id == declaration_id))
    decl = result.scalar_one_or_none()
    if not decl:
        raise HTTPException(status_code=404, detail="Declaration not found")
    if current_user.role == "operator" and str(decl.operator_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    return decl

@router.get("/declarations/{declaration_id}/file", summary="View the original uploaded file inline")
async def get_declaration_file(
    declaration_id: str,
    t: Optional[str] = Query(None),  # token via query param for direct browser tab access
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
):
    # Accept auth from Authorization header OR ?t= query param
    token = (credentials.credentials if credentials else None) or t
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = payload.get("sub")
    user_res = await db.execute(select(User).where(User.id == user_id))
    user = user_res.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(select(Declaration).where(Declaration.id == declaration_id))
    decl = result.scalar_one_or_none()
    if not decl:
        raise HTTPException(status_code=404, detail="Declaration not found")
    if user.role == "operator" and str(decl.operator_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    if not decl.file_path or not os.path.exists(decl.file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    safe_name = decl.filename.replace('"', '')
    return FileResponse(
        decl.file_path,
        media_type=decl.file_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


@router.patch("/declarations/{declaration_id}", response_model=DeclarationResponse,
              summary="Manually update declaration fields (operator review)")
async def update_declaration(
    declaration_id: str,
    data: DeclarationUpdate,
    current_user: User = Depends(require_role("admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Declaration).where(Declaration.id == declaration_id))
    decl = result.scalar_one_or_none()
    if not decl:
        raise HTTPException(status_code=404, detail="Declaration not found")
    if current_user.role == "operator" and str(decl.operator_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    # Separate line_items (JSON blob) from auditable scalar fields
    payload = data.model_dump(exclude_none=True)
    new_line_items = payload.pop("line_items", None)
    if new_line_items is not None:
        decl.line_items = new_line_items

    changes = {}
    for field, new_value in payload.items():
        old_value = getattr(decl, field, None)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
        setattr(decl, field, new_value)

    # Re-validate after manual update.
    # PENTING: validasi pakai nilai kolom TERBARU (hasil koreksi operator),
    # bukan decl.llm_extracted mentah — kalau tidak, koreksi operator
    # tidak pernah dianggap dan dokumen selalu balik FLAGGED.
    from app.validator.ceisa_rules import validate

    llm_header = (decl.llm_extracted or {}).get("header", decl.llm_extracted or {})
    HEADER_FIELDS = [
        "consignee", "npwp_consignee", "declared_value", "currency",
        "country_of_origin", "gross_weight", "net_weight",
        "fob_value", "freight_value", "cif_value",
        "shipper", "bl_number", "invoice_number", "invoice_date",
        "port_of_loading", "port_of_discharge", "port_of_transit",
        "vessel_name", "voyage_number",
        "package_quantity", "package_type", "container_marks", "bc11_number",
    ]
    header = {}
    for f in HEADER_FIELDS:
        original = llm_header.get(f) or {}
        header[f] = {
            "value": getattr(decl, f, None),
            # Field yang baru dikoreksi operator = confidence 1.0;
            # sisanya pertahankan confidence hasil ekstraksi LLM.
            "confidence": 1.0 if f in changes else original.get("confidence", 1.0),
        }

    decl.validation_result = validate(header, decl.line_items or [])
    decl.status = DeclarationStatus.VALIDATED if decl.validation_result["valid"] else DeclarationStatus.FLAGGED

    await db.commit()

    # Log changes to audit trail
    if changes:
        await log_audit(db, decl.id, current_user.id, changes)

    await db.refresh(decl)
    return decl

@router.post("/declarations/{declaration_id}/submit", response_model=DeclarationResponse)
async def submit(
    declaration_id: str,
    current_user: User = Depends(require_role("admin", "operator")),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await submit_declaration(declaration_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/declarations/{declaration_id}/audit", summary="Audit trail for a declaration")
async def get_audit(
    declaration_id: str,
    current_user: User = Depends(require_role("admin", "operator", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.declaration_id == declaration_id)
        .order_by(AuditLog.created_at)
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "field_name": log.field_name,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "operator_id": str(log.operator_id) if log.operator_id else None,
            "created_at": log.created_at,
        }
        for log in logs
    ]

@router.delete("/declarations/{declaration_id}", status_code=204)
async def delete_declaration(
    declaration_id: str,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Declaration).where(Declaration.id == declaration_id))
    decl = result.scalar_one_or_none()
    if not decl:
        raise HTTPException(status_code=404, detail="Declaration not found")
    await db.delete(decl)
    await db.commit()
