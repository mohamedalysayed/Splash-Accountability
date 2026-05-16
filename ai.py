"""Anthropic Claude-powered message generation and reply parsing."""

import contextvars
import json
import logging
import time

import anthropic

from config import settings
from db import record_api_usage

logger = logging.getLogger(__name__)

_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

# ---------------------------------------------------------------------------
# Usage tracking
# ---------------------------------------------------------------------------
# Anthropic publishes no balance/credits API, so we keep our own ledger. Prices
# are USD per 1M tokens (input, output). Update when Anthropic changes pricing.
# Unknown models cost 0 — never silently swallow billing surprises.
PRICES: dict[str, tuple[float, float]] = {
    # Sonnet 4 family
    "claude-sonnet-4-20250514": (3.0, 15.0),
    "claude-sonnet-4-5": (3.0, 15.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    # Opus 4 family
    "claude-opus-4-20250514": (15.0, 75.0),
    "claude-opus-4-6": (15.0, 75.0),
    # Haiku 4.5
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-haiku-4-5-20251001": (1.0, 5.0),
}

# Per-request user attribution — set by webhook/agent at the entry of a
# user-scoped operation so any Claude call made downstream is logged with the
# correct user_id. ContextVar is async-safe (each request gets its own value).
_current_user_id_ctx: contextvars.ContextVar[int | None] = contextvars.ContextVar(
    "current_user_id", default=None
)


def set_current_user_id(user_id: int | None) -> None:
    """Attribute subsequent Claude calls in this context to a user."""
    _current_user_id_ctx.set(user_id)


def _price_for(model: str) -> tuple[float, float]:
    """Lookup (input_per_M, output_per_M) for a model, falling back to 0."""
    if model in PRICES:
        return PRICES[model]
    # Prefix match — Anthropic versions models by date suffix.
    for known, price in PRICES.items():
        if model.startswith(known) or known.startswith(model):
            return price
    logger.warning("Unknown Anthropic model for pricing: %s — cost will be 0", model)
    return (0.0, 0.0)


def _log_usage(model: str, resp) -> None:
    """Extract token counts from an Anthropic response and persist a ledger row."""
    try:
        usage = getattr(resp, "usage", None)
        if usage is None:
            return
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        in_price, out_price = _price_for(model)
        cost = (input_tokens / 1_000_000.0) * in_price + (output_tokens / 1_000_000.0) * out_price
        record_api_usage(
            user_id=_current_user_id_ctx.get(),
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
        )
    except Exception:
        # Never let usage logging break a live message generation.
        logger.exception("Failed to log Anthropic usage")

SYSTEM_PROMPT = (
    "You are a friendly but firm accountability coach. "
    "Keep messages under 300 characters for WhatsApp readability. "
    "Be warm, use the person's name, reference their specific goals. "
    "No emojis overload — max 1-2 per message. Sound human, not like a bot."
)

_MAX_RETRIES = 3
_RETRY_DELAY = 3  # seconds


def _call_with_retry(model, max_tokens, system, messages):
    """Call Anthropic API with retry on rate limit errors.

    Every successful call is logged to the api_usage ledger (best-effort) so
    admins can monitor spend per-user / per-model in the dashboard.
    """
    for attempt in range(_MAX_RETRIES):
        try:
            resp = _client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
            )
            _log_usage(model, resp)
            return resp
        except anthropic.RateLimitError:
            if attempt < _MAX_RETRIES - 1:
                wait = _RETRY_DELAY * (attempt + 1)
                logger.warning("Rate limited, retrying in %ds (%d/%d)", wait, attempt + 1, _MAX_RETRIES)
                time.sleep(wait)
            else:
                logger.error("Rate limited after %d retries, giving up", _MAX_RETRIES)
                raise


def _chat(user_prompt: str, system: str = SYSTEM_PROMPT, max_tokens: int = 300) -> str:
    """Send a message to Claude and return the text response."""
    try:
        resp = _call_with_retry(
            settings.ANTHROPIC_MODEL,
            max_tokens,
            system,
            [{"role": "user", "content": user_prompt}],
        )
        return resp.content[0].text.strip()
    except Exception:
        logger.exception("Anthropic API call failed")
        return ""


def _chat_json(user_prompt: str, system: str = "") -> str:
    """Chat completion expecting JSON response."""
    json_system = (system or "") + (
        "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code fences, no explanation. "
        "Just the raw JSON object."
    )
    try:
        resp = _call_with_retry(
            settings.ANTHROPIC_MODEL,
            500,
            json_system.strip(),
            [{"role": "user", "content": user_prompt}],
        )
        raw = resp.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        return raw
    except Exception:
        logger.exception("Anthropic JSON API call failed")
        return "{}"


# ---------------------------------------------------------------------------
# Audio transcription
# ---------------------------------------------------------------------------


def transcribe_audio(audio_bytes: bytes, content_type: str = "audio/ogg") -> str:
    """Transcribe audio using Google Speech Recognition (free, no API key).

    Converts OGG/other formats to WAV via pydub+ffmpeg, then transcribes.
    Returns the transcribed text, or empty string on failure.
    """
    import io

    try:
        import speech_recognition as sr
        from pydub import AudioSegment
    except ImportError:
        logger.error("speech_recognition or pydub not installed")
        return ""

    try:
        # Determine format from content type
        media_type = content_type.split(";")[0].strip()
        fmt_map = {
            "audio/ogg": "ogg",
            "audio/mpeg": "mp3",
            "audio/mp4": "mp4",
            "audio/wav": "wav",
            "audio/webm": "webm",
            "audio/amr": "amr",
        }
        fmt = fmt_map.get(media_type, "ogg")

        # Convert to WAV for speech recognition
        audio_segment = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
        wav_io = io.BytesIO()
        audio_segment.export(wav_io, format="wav")
        wav_io.seek(0)

        # Transcribe with Google's free speech API
        recognizer = sr.Recognizer()
        with sr.AudioFile(wav_io) as source:
            audio_data = recognizer.record(source)

        transcript = recognizer.recognize_google(audio_data)
        logger.info("Transcribed audio (%d bytes): %s", len(audio_bytes), transcript[:100])
        return transcript

    except sr.UnknownValueError:
        logger.warning("Speech recognition could not understand the audio")
        return ""
    except sr.RequestError as e:
        logger.error("Speech recognition service error: %s", e)
        return ""
    except Exception:
        logger.exception("Audio transcription failed")
        return ""


# ---------------------------------------------------------------------------
# Message generation
# ---------------------------------------------------------------------------

def generate_morning_message(
    user_name: str,
    streak_count: int,
    yesterday_score: float | None,
    recurring_reminders: list[str] | None = None,
) -> str:
    context_parts = [f"User's name: {user_name}"]
    if streak_count > 0:
        context_parts.append(f"Current streak: {streak_count} days")
    if yesterday_score is not None:
        context_parts.append(f"Yesterday's score: {yesterday_score}%")
    else:
        context_parts.append("No data from yesterday")

    reminders_text = ""
    if recurring_reminders:
        reminders_text = (
            "\n\nThe user has these daily reminders that should ALWAYS be mentioned:\n"
            + "\n".join(f"- {r}" for r in recurring_reminders)
            + "\nWeave these into the message naturally (e.g. 'Don't forget your gym session today!' "
            "or 'Have you planned your social media post?')."
        )

    prompt = (
        f"{' | '.join(context_parts)}\n\n"
        "Write a morning accountability check-in message. "
        "Ask them what their top 3 goals are for today. "
        "If they have a streak, acknowledge it. "
        "If yesterday was rough, be encouraging. "
        f"Use WhatsApp formatting (*bold*, _italic_).{reminders_text}"
    )
    result = _chat(prompt)
    return result or (
        f"Good morning {user_name}! What are your top 3 goals for today?"
    )


def generate_midday_message(user_name: str, goals_list: list[str]) -> str:
    goals_formatted = "\n".join(f"{i}. {g}" for i, g in enumerate(goals_list, 1))
    prompt = (
        f"User's name: {user_name}\n"
        f"Today's goals:\n{goals_formatted}\n\n"
        "Write a midday check-in reminding them of their goals and asking for a progress update. "
        "Be conversational and motivating. Use WhatsApp formatting."
    )
    result = _chat(prompt)
    return result or (
        f"Hey {user_name}! Midday check — how's progress on your goals?"
    )


def generate_evening_message(user_name: str, goals_list: list[str]) -> str:
    goals_formatted = "\n".join(f"{i}. {g}" for i, g in enumerate(goals_list, 1))
    prompt = (
        f"User's name: {user_name}\n"
        f"Today's goals:\n{goals_formatted}\n\n"
        "Write an evening check-in asking which goals they completed today. "
        "Be encouraging. Ask them to tell you which ones they finished. "
        "Use WhatsApp formatting."
    )
    result = _chat(prompt)
    return result or (
        f"Evening {user_name}! Which of your goals did you knock out today?"
    )


def generate_score_message(
    user_name: str,
    goals_set: int,
    goals_completed: int,
    score: float,
    streak: int,
) -> str:
    prompt = (
        f"User's name: {user_name}\n"
        f"Goals set: {goals_set} | Completed: {goals_completed} | Score: {score}%\n"
        f"Current streak: {streak} days\n\n"
        "Write a score summary message. "
        "If score is high (>=80%), be celebratory. "
        "If moderate (50-79%), be encouraging. "
        "If low (<50%), be supportive but firm. "
        "Mention the streak. Use WhatsApp formatting."
    )
    result = _chat(prompt)
    return result or (
        f"{user_name}, today's score: *{score}%* ({goals_completed}/{goals_set} goals). "
        f"Streak: {streak} days."
    )


def generate_reminder_message(user_name: str, check_in_type: str) -> str:
    prompt = (
        f"User's name: {user_name}\n"
        f"Missed check-in type: {check_in_type}\n\n"
        f"Write a gentle nudge reminding them to reply to the {check_in_type} check-in. "
        "Keep it very short (under 150 chars). Don't be pushy."
    )
    result = _chat(prompt)
    return result or (
        f"Hey {user_name}, just checking in — did you see my earlier message?"
    )


def generate_weekly_summary(user_name: str, weekly_scores: list[dict]) -> str:
    """weekly_scores: list of dicts with keys date, score, goals_set, goals_completed."""
    scores_text = "\n".join(
        f"  {s['date']}: {s['score']}% ({s['goals_completed']}/{s['goals_set']})"
        for s in weekly_scores
    )
    avg_score = (
        sum(s["score"] for s in weekly_scores) / len(weekly_scores)
        if weekly_scores
        else 0
    )
    prompt = (
        f"User's name: {user_name}\n"
        f"Weekly scores:\n{scores_text}\n"
        f"Average: {avg_score:.1f}%\n\n"
        "Write a weekly summary. Identify patterns (best/worst days). "
        "Be encouraging about wins, constructive about misses. "
        "Keep it under 500 characters. Use WhatsApp formatting."
    )
    result = _chat(prompt, max_tokens=400)
    return result or f"{user_name}, your weekly avg: *{avg_score:.0f}%*. Keep pushing!"


# ---------------------------------------------------------------------------
# Reply parsing
# ---------------------------------------------------------------------------

def parse_goals_from_reply(reply_text: str) -> list[str]:
    """Extract individual goals from free-text reply using AI."""
    prompt = (
        "The user was asked for their top goals for the day. "
        "Extract each distinct goal from their reply as a short phrase.\n\n"
        f'User reply: "{reply_text}"\n\n'
        'Respond with JSON: {"goals": ["goal 1", "goal 2", ...]}\n'
        'If you cannot parse any goals, return {"goals": []}.'
    )
    raw = _chat_json(prompt)
    try:
        data = json.loads(raw)
        goals = data.get("goals", [])
        if isinstance(goals, list) and all(isinstance(g, str) for g in goals):
            return [g.strip() for g in goals if g.strip()]
    except (json.JSONDecodeError, KeyError):
        logger.warning("Failed to parse goals JSON: %s", raw)

    # Fallback: split by common separators
    for sep in ["\n", ",", ";"]:
        if sep in reply_text:
            parts = [p.strip().lstrip("0123456789.-) ") for p in reply_text.split(sep)]
            return [p for p in parts if len(p) > 2]
    return [reply_text.strip()] if reply_text.strip() else []


def parse_completion_from_reply(reply_text: str, original_goals: list[str]) -> list[bool]:
    """Determine which goals were completed from an evening reply.

    Returns a list of booleans matching original_goals order.
    """
    goals_formatted = "\n".join(f"{i}. {g}" for i, g in enumerate(original_goals, 1))
    prompt = (
        "The user was asked which of their daily goals they completed.\n"
        f"Original goals:\n{goals_formatted}\n\n"
        f'User reply: "{reply_text}"\n\n'
        "For each goal, determine if the user completed it based on their reply.\n"
        'Respond with JSON: {"completed": [true, false, true, ...]} '
        "matching the order of the original goals."
    )
    raw = _chat_json(prompt)
    try:
        data = json.loads(raw)
        completed = data.get("completed", [])
        if isinstance(completed, list) and len(completed) == len(original_goals):
            return [bool(c) for c in completed]
    except (json.JSONDecodeError, KeyError):
        logger.warning("Failed to parse completion JSON: %s", raw)

    # Fallback: assume all completed if positive language
    positive_words = {"all", "done", "finished", "completed", "yes", "everything"}
    if any(w in reply_text.lower() for w in positive_words):
        return [True] * len(original_goals)
    return [False] * len(original_goals)


def classify_freeform_message(
    message: str, user_name: str, goals_today: list[str], today_iso: str = ""
) -> dict:
    """Classify a free-form message sent outside of check-in windows.

    Returns dict with:
      - intent: "set_goals" | "report_completions" | "general"
      - goals: list of goal strings (if intent is set_goals)
      - completed: list of booleans (if intent is report_completions, matches goals_today order)
      - reply: string response to send back
      - date: ISO date string if the user references a specific day (e.g. "on Friday")
    """
    goals_context = ""
    if goals_today:
        goals_formatted = "\n".join(f"{i}. {g}" for i, g in enumerate(goals_today, 1))
        goals_context = f"\nTheir goals for today:\n{goals_formatted}"

    date_context = f"\nToday's date is {today_iso}." if today_iso else ""

    prompt = (
        f"You are an accountability coach talking to {user_name} on WhatsApp.\n"
        f"They sent a message outside of the scheduled check-in times.{goals_context}{date_context}\n\n"
        f'Their message: "{message}"\n\n'
        "Classify the message intent and respond.\n"
        "Respond with JSON:\n"
        "{\n"
        '  "intent": "set_goals" | "report_achievements" | "report_completions" | "general",\n'
        '  "goals": ["goal1", "goal2", ...],  // if intent is set_goals OR report_achievements\n'
        '  "completed": [true, false, ...],  // only if intent is report_completions, must match goals order\n'
        '  "date": "YYYY-MM-DD",  // if the user mentions a specific past day (e.g. "on Friday", "yesterday"). '
        "Resolve relative dates using today's date. Omit or set null if they mean today.\n"
        '  "reply": "your warm, short response (under 300 chars, WhatsApp style)"\n'
        "}\n\n"
        "Intent guide:\n"
        "- set_goals: user is listing goals/plans/tasks they WANT to accomplish (future tense)\n"
        "- report_achievements: user is sharing things they already DID/accomplished/achieved today OR on a past day. "
        "Keywords: 'achieved', 'did', 'finished', 'completed', 'done', 'here is what I did', 'on Friday I...'. "
        "Extract each achievement as a short goal phrase in the 'goals' field. THIS IS VERY IMPORTANT.\n"
        "- report_completions: user is confirming completion of EXISTING goals they already set"
        + (" (match against their existing goals)" if goals_today else " (no existing goals today)") + "\n"
        "- general: ONLY for greetings, questions, or chat that does NOT mention any tasks/goals/achievements\n\n"
        "IMPORTANT: If the user mentions ANY tasks, goals, or achievements, do NOT classify as 'general'. "
        "When in doubt between 'report_achievements' and 'general', prefer 'report_achievements'."
    )

    raw = _chat_json(prompt)
    logger.info("Freeform classification raw: %s", raw[:200])
    try:
        data = json.loads(raw)
        intent = data.get("intent", "general")
        logger.info("Classified intent: %s, goals: %s", intent, data.get("goals", []))
        result = {"intent": intent, "reply": data.get("reply", "")}

        if intent == "set_goals":
            goals = data.get("goals", [])
            if isinstance(goals, list) and all(isinstance(g, str) for g in goals):
                result["goals"] = [g.strip() for g in goals if g.strip()]
            else:
                result["intent"] = "general"

        elif intent == "report_completions" and goals_today:
            completed = data.get("completed", [])
            if isinstance(completed, list) and len(completed) == len(goals_today):
                result["completed"] = [bool(c) for c in completed]
            else:
                result["intent"] = "general"

        elif intent == "report_achievements":
            goals = data.get("goals", [])
            if isinstance(goals, list) and all(isinstance(g, str) for g in goals):
                result["goals"] = [g.strip() for g in goals if g.strip()]
            else:
                result["intent"] = "general"

        # Extract referenced date (e.g. "on Friday" → "2026-05-15")
        ref_date = data.get("date")
        if ref_date and isinstance(ref_date, str) and ref_date != today_iso:
            result["date"] = ref_date

        return result

    except (json.JSONDecodeError, KeyError):
        logger.warning("Failed to parse freeform classification: %s", raw)
        return {"intent": "general", "reply": ""}
