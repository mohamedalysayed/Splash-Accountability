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
    # Twilio Sandbox opt-in phrase ("join <two-words>") shown in the Twilio
    # Console. Required for new users on the sandbox; empty in production where
    # the number is approved. Exposed via the public /api/config endpoint so
    # the dashboard onboarding can render exact instructions.
    TWILIO_SANDBOX_JOIN_CODE: str = os.getenv("TWILIO_SANDBOX_JOIN_CODE", "")

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

    # CORS — comma-separated allowed origins (e.g. "https://app.netlify.app,https://example.com")
    # Defaults to "*" for local dev; production should set this to the dashboard origin.
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")
    # Optional regex (e.g. r"https://.*\.netlify\.app") for preview deploys.
    CORS_ORIGIN_REGEX: str = os.getenv("CORS_ORIGIN_REGEX", "")

    # Optional
    NGROK_AUTHTOKEN: str = os.getenv("NGROK_AUTHTOKEN", "")

    # Super-admin bootstrap — comma-separated emails. Users matching these are
    # auto-promoted to admin on every /api/auth/me call; users dropped from the
    # list are auto-demoted. This means admin status is fully controlled by env
    # secrets — no risk of self-lockout via the admin UI.
    ADMIN_EMAILS: list[str] = [
        e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()
    ]

    # Avatar uploads
    AVATAR_DIR: str = os.getenv(
        "AVATAR_DIR",
        str(Path(__file__).resolve().parent / "data" / "avatars"),
    )
    MAX_AVATAR_BYTES: int = int(os.getenv("MAX_AVATAR_BYTES", str(2 * 1024 * 1024)))  # 2 MB
    ALLOWED_AVATAR_MIME: set[str] = {"image/jpeg", "image/png", "image/webp"}

    # Recurring reminders (included in every morning check-in)
    RECURRING_REMINDERS: list[str] = [
        r for r in os.getenv("RECURRING_REMINDERS", "Gym session,Post on social media").split(",") if r.strip()
    ]

    # Stripe billing
    STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    # Hosted Stripe Payment Link (https://buy.stripe.com/...). Backend appends
    # ?client_reference_id=<user.id>&prefilled_email=<email> so the webhook
    # can attribute the subscription back to a Splash account.
    STRIPE_PAYMENT_LINK: str = os.getenv(
        "STRIPE_PAYMENT_LINK",
        "https://buy.stripe.com/4gM28reW46w83Rh1Fu8k80m",
    )
    # Public URL of the dashboard — used as return_url for Stripe Customer Portal.
    DASHBOARD_URL: str = os.getenv("DASHBOARD_URL", "https://splash-accountability.netlify.app")

    # Google OAuth — the OAuth 2.0 Client ID (the .apps.googleusercontent.com one)
    # from Google Cloud Console. Same value on backend and frontend
    # (NEXT_PUBLIC_GOOGLE_CLIENT_ID on the Netlify side). Backend uses it to
    # verify the audience claim of incoming Google ID tokens.
    GOOGLE_OAUTH_CLIENT_ID: str = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")

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
