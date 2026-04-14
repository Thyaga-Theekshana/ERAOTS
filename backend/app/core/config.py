"""
ERAOTS Application Configuration.
Loads settings from environment variables / .env file.
"""
from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # Application
    APP_NAME: str = "ERAOTS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    SECRET_KEY: str = "dev-secret-key-change-in-production"

    # Database — defaults to SQLite for dev, use PostgreSQL in production
    DATABASE_URL: str = "sqlite+aiosqlite:///./eraots.db"
    # For PostgreSQL: DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/eraots

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = "dev-jwt-secret-change-this"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Office
    OFFICE_CAPACITY: int = 100
    OFFICE_TIMEZONE: str = "Asia/Colombo"
    AUTO_CHECKOUT_HOUR: int = 23
    AUTO_CHECKOUT_MINUTE: int = 59

    # Policies (defaults)
    BREAK_THRESHOLD_MINUTES: int = 30
    GRACE_PERIOD_MINUTES: int = 15

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@eraots.com"

    # Twilio (WhatsApp)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = "whatsapp:+14155238886"

    # Simulator
    SIMULATOR_ENABLED: bool = True
    SIMULATOR_EMPLOYEE_COUNT: int = 20
    SIMULATOR_SCAN_INTERVAL_SECONDS: int = 30

    # Google Calendar OAuth2
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/calendar/callback"

    # Jira Integration
    JIRA_URL: str = ""
    JIRA_SERVICE_EMAIL: str = ""
    JIRA_API_TOKEN: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()
