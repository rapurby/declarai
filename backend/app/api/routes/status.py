from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import require_role
from app.models.declaration import Declaration
from app.models.user import User

router = APIRouter()

@router.get("/status/{declaration_id}", summary="Quick status check for a declaration")
async def get_status(
    declaration_id: str,
    current_user: User = Depends(require_role("admin", "operator", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Declaration).where(Declaration.id == declaration_id))
    decl = result.scalar_one_or_none()
    if not decl:
        raise HTTPException(status_code=404, detail="Declaration not found")
    return {
        "declaration_id": str(decl.id),
        "filename": decl.filename,
        "status": decl.status,
        "validation_score": (decl.validation_result or {}).get("score"),
        "processing_time_ms": decl.processing_time_ms,
        "ceisa_registration": (decl.ceisa_response or {}).get("registration_number"),
        "created_at": decl.created_at,
        "updated_at": decl.updated_at
    }
