from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.core.security import require_role
from app.models.declaration import Declaration, DeclarationStatus
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.declaration import DeclarationResponse, DeclarationListItem, DeclarationUpdate
from app.services.declaration_service import submit_declaration, get_dashboard_stats, log_audit
from typing import Optional

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

@router.get("/declarations/stats", summary="Dashboard statistics")
async def dashboard_stats(
    current_user: User = Depends(require_role("admin", "operator", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    return await get_dashboard_stats(db)

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

    changes = {}
    for field, new_value in data.model_dump(exclude_none=True).items():
        old_value = getattr(decl, field, None)
        if old_value != new_value:
            changes[field] = (old_value, new_value)
        setattr(decl, field, new_value)

    # Re-validate after manual update
    if decl.llm_extracted:
        from app.validator.ceisa_rules import validate
        decl.validation_result = validate(decl.llm_extracted)
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
