from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.routes import upload, declaration, status, auth, simulator
from app.api.routes import admin, ws, scan
from app.core.database import init_db
from app.core.config import settings
import logging, os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 DeclarAI starting up...")
    os.makedirs(settings.FILE_STORAGE_PATH, exist_ok=True)
    await init_db()
    logger.info("✅ Database initialized")
    yield
    logger.info("DeclarAI shutting down...")

app = FastAPI(
    title="DeclarAI API",
    description="""
## DeclarAI — AI-Powered Customs Declaration Automation

Automates extraction of customs data from CIPL documents using OCR + LLM.

### Roles
- **admin** — full access including user management
- **operator** — upload, review, edit, submit declarations
- **viewer** — read-only access to declarations and dashboard
""",
    version="1.0.0",
    lifespan=lifespan,
)

origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    settings.FRONTEND_URL,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,        prefix="/api/v1/auth",        tags=["Auth"])
app.include_router(upload.router,      prefix="/api/v1",             tags=["Upload"])
app.include_router(declaration.router, prefix="/api/v1",             tags=["Declaration"])
app.include_router(status.router,      prefix="/api/v1",             tags=["Status"])
app.include_router(simulator.router,   prefix="/api/v1/simulator",   tags=["CEISA Simulator"])
app.include_router(admin.router,       prefix="/api/v1/admin",       tags=["Admin"])
app.include_router(scan.router,        prefix="/api/v1",             tags=["QR Scan"])
app.include_router(ws.router,          tags=["WebSocket"])

@app.get("/", tags=["Root"])
async def root():
    return {"app": "DeclarAI", "version": "1.0.0", "status": "running", "docs": "/docs"}

@app.get("/health", tags=["Root"])
async def health():
    return {"status": "ok", "service": "declarai-backend"}
