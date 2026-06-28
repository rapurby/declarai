"""Run once to create the first admin user."""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import AsyncSessionLocal, init_db
from app.core.security import hash_password
from app.models.user import User

async def seed():
    await init_db()
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == "admin@cdp.co.id"))
        if existing.scalar_one_or_none():
            print("Admin already exists.")
            return
        admin = User(
            email="admin@cdp.co.id",
            full_name="CDP System Admin",
            hashed_password=hash_password("Admin@CDP2026"),
            role="admin",
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        print("Admin created: admin@cdp.co.id / Admin@CDP2026")

asyncio.run(seed())
