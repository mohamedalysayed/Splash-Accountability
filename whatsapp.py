"""Messaging layer — sends via WhatsApp (Twilio) or console depending on config."""

import logging
import uuid
from datetime import datetime, timezone

from config import settings
from db import get_last_outbound_timestamp, get_user_by_phone, log_message

logger = logging.getLogger(__name__)

# Only initialize Twilio if in whatsapp mode
_client = None
_validator = None

if settings.MESSAGING_MODE == "whatsapp":
    try:
        from twilio.request_validator import RequestValidator
        from twilio.rest import Client
        _client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        _validator = RequestValidator(settings.TWILIO_AUTH_TOKEN)
    except Exception:
        logger.exception("Failed to init Twilio client — falling back to console mode")


def send_message(to_number: str, body: str, is_reply: bool = False) -> str | None:
    """Send a message. Uses Twilio WhatsApp or prints to console based on MESSAGING_MODE.

    Returns a message ID (SID or generated) or None if rate-limited/failed.
    Set is_reply=True to bypass rate limiting (for replies to inbound messages).
    """
    # Rate limit check (skip for replies to user messages)
    user = get_user_by_phone(to_number)
    if user and not is_reply:
        last_sent = get_last_outbound_timestamp(user.id)
        if last_sent:
            # Ensure both datetimes are timezone-aware for comparison
            if last_sent.tzinfo is None:
                last_sent = last_sent.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - last_sent).total_seconds()
            if elapsed < settings.MIN_MESSAGE_INTERVAL_SECONDS:
                logger.warning(
                    "Rate limited: only %ds since last message (min %ds)",
                    int(elapsed),
                    settings.MIN_MESSAGE_INTERVAL_SECONDS,
                )
                return None

    # Truncate to WhatsApp limit
    if len(body) > 1600:
        body = body[:1597] + "..."

    if settings.MESSAGING_MODE == "whatsapp" and _client:
        return _send_whatsapp(to_number, body, user)
    else:
        return _send_console(to_number, body, user)


def _send_whatsapp(to_number: str, body: str, user) -> str | None:
    """Send via Twilio WhatsApp API."""
    try:
        message = _client.messages.create(
            from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
            to=f"whatsapp:{to_number}",
            body=body,
        )
        logger.info("Sent WhatsApp to %s (SID: %s)", to_number, message.sid)
        if user:
            log_message(user.id, "outbound", body, message.sid)
        return message.sid
    except Exception:
        logger.exception("Failed to send WhatsApp message to %s", to_number)
        return None


def _send_console(to_number: str, body: str, user) -> str:
    """Print message to console + log. Used when Twilio is not configured."""
    msg_id = f"console-{uuid.uuid4().hex[:8]}"
    print()
    print("=" * 50)
    print(f"  TO: {to_number}")
    print("-" * 50)
    print(f"  {body}")
    print("=" * 50)
    print()
    logger.info("Console message to %s: %s", to_number, body[:80])
    if user:
        log_message(user.id, "outbound", body, msg_id)
    return msg_id


def validate_twilio_signature(signature: str, url: str, params: dict) -> bool:
    """Validate the X-Twilio-Signature header."""
    if _validator:
        return _validator.validate(url, params, signature)
    return True  # skip validation in console mode
