import os
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

    # Demo workspace
    DEMO_MODE: bool = True
    DEMO_EMAIL: str = "demo@unification.app"
    DEMO_PASSWORD: str = "demo12345"
    DEMO_REPLY_DELAY_SECONDS: float = 3.0


settings = Settings()
