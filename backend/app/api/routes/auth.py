from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, require_role
from app.models.user import User
from app.schemas.auth import UserCreate, UserLogin, Token, UserResponse

router = APIRouter()

@router.post("/register", response_model=UserResponse, status_code=201)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    # Reject non-company emails in production
    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=data.role if data.role in ["operator", "viewer"] else "operator",
        is_active=False,  # admin must approve
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse(id=str(user.id), email=user.email, full_name=user.full_name,
                        role=user.role, is_active=user.is_active)

@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account pending admin approval")
    token = create_access_token({"sub": str(user.id), "role": user.role, "email": user.email})
    return Token(access_token=token, user_id=str(user.id),
                 full_name=user.full_name, role=user.role, email=user.email)

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(require_role("admin", "operator", "viewer"))):
    return UserResponse(id=str(current_user.id), email=current_user.email,
                        full_name=current_user.full_name, role=current_user.role,
                        is_active=current_user.is_active)

@router.post("/change-password", status_code=200)
async def change_password(
    body: dict,
    current_user: User = Depends(require_role("admin", "operator", "viewer")),
    db: AsyncSession = Depends(get_db),
):
    current_pw  = body.get("current_password", "")
    new_pw      = body.get("new_password", "")

    if not current_pw or not new_pw:
        raise HTTPException(status_code=400, detail="current_password and new_password are required")
    if len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    if not verify_password(current_pw, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.hashed_password = hash_password(new_pw)
    await db.commit()
    return {"ok": True, "message": "Password changed successfully"}
