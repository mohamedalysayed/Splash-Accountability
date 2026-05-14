"""Configuration module — loads all settings from .env file."""

import logging
import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

_config_logger = logging.getLogger(__name__)

# Load .env from project root
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)


class Settings:
    """Application settings loaded from environment variables."""

    # Messaging mode: "console" (free, local) or "whatsapp" (requires Twilio)
    MESSAGING_MODE: str = os.getenv("MESSAGING_MODE", "console")

    # Twilio (only needed if MESSAGING_MODE=whatsapp)
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_NUMBER: str = os.getenv("TWILIO_WHATSAPP_NUMBER", "")

    # User
    USER_WHATSAPP_NUMBER: str = os.getenv("USER_WHATSAPP_NUMBER", "")
    USER_NAME: str = os.getenv("USER_NAME", "User")
    USER_TIMEZONE: str = os.getenv("USER_TIMEZONE", "Europe/Zurich")

    # Schedule (HH:MM in user's timezone)
    MORNING_TIME: str = os.getenv("MORNING_TIME", "08:00")
    MIDDAY_TIME: str = os.getenv("MIDDAY_TIME", "13:00")
    EVENING_TIME: str = os.getenv("EVENING_TIME", "19:00")
    REMINDER_DELAY_MINUTES: int = int(os.getenv("REMINDER_DELAY_MINUTES", "60"))

    # Anthropic
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

    # Infrastructure
    WEBHOOK_HOST: str = os.getenv("WEBHOOK_HOST", "0.0.0.0")
    WEBHOOK_PORT: int = int(os.getenv("WEBHOOK_PORT", "8080"))
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{Path(__file__).resolve().parent / 'data' / 'accountability.db'}",
    )
    DASHBOARD_PORT: int = int(os.getenv("DASHBOARD_PORT", "8501"))

    # JWT Authentication
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_EXPIRY_DAYS: int = int(os.getenv("JWT_EXPIRY_DAYS", "7"))

    # Optional
    NGROK_AUTHTOKEN: str = os.getenv("NGROK_AUTHTOKEN", "")

    # Rate limiting
    MIN_MESSAGE_INTERVAL_SECONDS: int = 300  # 5 minutes between messages

    # Logging
    LOG_FILE: str = str(Path(__file__).resolve().parent / "data" / "agent.log")


settings = Settings()

# Generate a random JWT_SECRET if not provided (warn in logs)
if not settings.JWT_SECRET:
    settings.JWT_SECRET = secrets.token_urlsafe(32)
    _config_logger.warning(
        "JWT_SECRET not set in environment — using a randomly generated secret. "
        "Tokens will be invalidated on restart. Set JWT_SECRET in .env for persistence."
    )
