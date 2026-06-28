from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/declarai"
    ANTHROPIC_API_KEY: str = "sk-ant-placeholder"
    CEISA_API_URL: str = "https://sandbox.beacukai.go.id/api"
    CEISA_API_KEY: str = ""
    APP_ENV: str = "development"
    SECRET_KEY: str = "declarai_secret_2026"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    FRONTEND_URL: str = "http://localhost:5173"
    FILE_STORAGE_PATH: str = "uploads"

    class Config:
        env_file = ".env"

settings = Settings()
