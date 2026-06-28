from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User
from app.schemas.auth import UserResponse

router = APIRouter()

@router.get("/users", response_model=list[UserResponse])
async def list_users(
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return [
        UserResponse(id=str(u.id), email=u.email, full_name=u.full_name,
                     role=u.role, is_active=u.is_active)
        for u in result.scalars().all()
    ]

@router.patch("/users/{user_id}/approve")
async def approve_user(
    user_id: str,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    await db.commit()
    return {"message": f"User {user.email} approved"}

@router.patch("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    user.is_active = False
    await db.commit()
    return {"message": f"User {user.email} deactivated"}

@router.patch("/users/{user_id}/role")
async def change_role(
    user_id: str,
    role: str,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    if role not in ["admin", "operator", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be admin, operator, or viewer")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = role
    await db.commit()
    return {"message": f"Role updated to '{role}' for {user.email}"}
