import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENV_FILE_PATH = os.path.join(BASE_DIR, ".env")


class Settings(BaseSettings):
    """Application settings loaded from environment or .env file"""

    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    PROJECT_NAME: str = "Unification Platform"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False

    # Database Settings
    DATABASE_URL: str = "sqlite+aiosqlite:///./unification.db"

    # Security
    SECRET_KEY: str = "unification-dev-secret-key-change-in-production-32b"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    CORS_ORIGINS: list[str] = ["*"]

    # LLM: "fake" (offline, deterministic) or "openai" (any OpenAI-compatible API: OpenAI, Gemini, NVIDIA NIM)
    LLM_PROVIDER: str = "fake"
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL: str = "gemini-3.6-flash"
    LLM_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    LLM_TIMEOUT_SECONDS: float = 60.0

    # Channels
    PUBLIC_BASE_URL: str = "http://localhost:8000"  # where Meta reaches this server (webhook URLs shown to users)
    META_GRAPH_URL: str = "https://graph.facebook.com/v20.0"

    # Gmail (Google OAuth client of type "Web application"; redirect URI {PUBLIC_BASE_URL}/api/v1/channels/gmail/callback)
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_AUTH_URL: str = "https://accounts.google.com/o/oauth2/v2/auth"
    GOOGLE_TOKEN_URL: str = "https://oauth2.googleapis.com/token"
    GMAIL_API_URL: str = "https://gmail.googleapis.com/gmail/v1"
    GMAIL_SYNC_SECONDS: float = 60.0  # 0 turns the background sync off
    FRONTEND_URL: str = "http://localhost:5173"  # where the browser returns after Google sign-in

    # Demo workspace
    DEMO_MODE: bool = True
    DEMO_EMAIL: str = "demo@unification.app"
    DEMO_PASSWORD: str = "demo12345"
    DEMO_REPLY_DELAY_SECONDS: float = 3.0


settings = Settings()
