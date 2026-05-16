"""Core accountability agent — APScheduler-based scheduler with all check-in logic."""

import logging
import sys
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

import ai
from ai import (
    generate_evening_message,
    generate_midday_message,
    generate_morning_message,
    generate_reminder_message,
    generate_score_message,
    generate_weekly_summary,
    parse_completion_from_reply,
)
from config import settings
from db import (
    User,
    calculate_daily_score,
    get_all_active_users,
    get_all_pending_check_ins,
    get_check_in_exists,
    get_current_streak,
    get_goals,
    get_or_create_user,
    get_stats,
    get_total_days_tracked,
    get_user_by_phone,
    get_yesterday_score,
    init_db,
    mark_goals_from_reply,
    save_check_in,
    save_daily_score,
)
from whatsapp import send_message

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

def setup_logging():
    fmt = logging.Formatter(
        "%(asctime)s | %(name)-18s | %(levelname)-7s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    root.addHandler(console)

    try:
        from pathlib import Path
        Path(settings.LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(settings.LOG_FILE)
        fh.setFormatter(fmt)
        root.addHandler(fh)
    except Exception:
        pass

    # Quiet noisy libraries
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("anthropic").setLevel(logging.WARNING)


setup_logging()
logger = logging.getLogger("agent")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_default_tz = ZoneInfo(settings.USER_TIMEZONE)


def _user_tz(user: User) -> ZoneInfo:
    """Get the timezone for a specific user."""
    return ZoneInfo(user.timezone or settings.USER_TIMEZONE)


def _now_local_for_user(user: User) -> datetime:
    return datetime.now(_user_tz(user))


def _today_for_user(user: User) -> date:
    return _now_local_for_user(user).date()


def _now_local() -> datetime:
    """Default local time (used for scheduler timezone)."""
    return datetime.now(_default_tz)


def _today() -> date:
    return _now_local().date()


def _get_user():
    """Legacy helper — get the first user from settings (backwards compat)."""
    return get_or_create_user(
        settings.USER_WHATSAPP_NUMBER,
        settings.USER_NAME,
        settings.USER_TIMEZONE,
    )


def _parse_time(t: str) -> tuple[int, int]:
    parts = t.split(":")
    return int(parts[0]), int(parts[1])


# ---------------------------------------------------------------------------
# Check-in functions
# ---------------------------------------------------------------------------

def _morning_check_in_for_user(user: User):
    """Send morning check-in asking for today's goals for a specific user."""
    # Attribute Claude calls in this job to this user (api_usage ledger).
    ai.set_current_user_id(user.id)
    if not user.phone:
        logger.debug("User %d (%s) has no phone, skipping morning check-in", user.id, user.name)
        return

    today = _today_for_user(user)

    if get_check_in_exists(user.id, today, "morning"):
        logger.info("Morning check-in already sent today for user %d, skipping", user.id)
        return

    streak = get_current_streak(user.id)
    yd = get_yesterday_score(user.id)
    yd_score = yd.score if yd else None

    msg = generate_morning_message(user.name, streak, yd_score, settings.RECURRING_REMINDERS)
    if not msg:
        msg = f"Good morning {user.name}! What are your top 3 goals for today?"

    sid = send_message(user.phone, msg)
    if sid:
        save_check_in(user.id, today, "morning", msg)
        logger.info("Morning check-in sent to user %d", user.id)


def _midday_check_in_for_user(user: User):
    """Send midday progress check for a specific user."""
    ai.set_current_user_id(user.id)
    if not user.phone:
        return

    today = _today_for_user(user)

    if get_check_in_exists(user.id, today, "midday"):
        logger.info("Midday check-in already sent today for user %d, skipping", user.id)
        return

    goals = get_goals(user.id, today)
    if not goals:
        msg = generate_reminder_message(user.name, "morning")
        if not msg:
            msg = f"Hey {user.name}, I haven't heard your goals yet! What are your top 3 for today?"
        sid = send_message(user.phone, msg)
        if sid:
            save_check_in(user.id, today, "reminder", msg)
        return

    goal_texts = [g.goal_text for g in goals]
    msg = generate_midday_message(user.name, goal_texts)
    if not msg:
        goals_str = "\n".join(f"{i}. {g}" for i, g in enumerate(goal_texts, 1))
        msg = f"Hey {user.name}! Midday check-in.\nYour goals:\n{goals_str}\n\nHow's it going?"

    sid = send_message(user.phone, msg)
    if sid:
        save_check_in(user.id, today, "midday", msg)
        logger.info("Midday check-in sent to user %d", user.id)


def _evening_check_in_for_user(user: User):
    """Send evening check-in asking for completion status for a specific user."""
    ai.set_current_user_id(user.id)
    if not user.phone:
        return

    today = _today_for_user(user)

    if get_check_in_exists(user.id, today, "evening"):
        logger.info("Evening check-in already sent today for user %d, skipping", user.id)
        return

    goals = get_goals(user.id, today)
    if not goals:
        msg = (
            f"Hey {user.name}, looks like we didn't set goals today. "
            "No worries — let's start fresh tomorrow morning!"
        )
        sid = send_message(user.phone, msg)
        if sid:
            save_check_in(user.id, today, "evening", msg)
        calculate_and_save_score(user.id, today)
        return

    goal_texts = [g.goal_text for g in goals]
    msg = generate_evening_message(user.name, goal_texts)
    if not msg:
        goals_str = "\n".join(f"{i}. {g}" for i, g in enumerate(goal_texts, 1))
        msg = f"Evening {user.name}! Which of these did you complete?\n{goals_str}"

    sid = send_message(user.phone, msg)
    if sid:
        save_check_in(user.id, today, "evening", msg)
        logger.info("Evening check-in sent to user %d", user.id)


def morning_check_in():
    """Send morning check-in to ALL active users."""
    logger.info("Running morning check-in for all users")
    for user in get_all_active_users():
        try:
            _morning_check_in_for_user(user)
        except Exception:
            logger.exception("Error in morning check-in for user %d", user.id)


def midday_check_in():
    """Send midday check-in to ALL active users."""
    logger.info("Running midday check-in for all users")
    for user in get_all_active_users():
        try:
            _midday_check_in_for_user(user)
        except Exception:
            logger.exception("Error in midday check-in for user %d", user.id)


def evening_check_in():
    """Send evening check-in to ALL active users."""
    logger.info("Running evening check-in for all users")
    for user in get_all_active_users():
        try:
            _evening_check_in_for_user(user)
        except Exception:
            logger.exception("Error in evening check-in for user %d", user.id)



def process_evening_reply(user_id: int, reply_text: str):
    """Parse which goals were completed, calculate score, send summary."""
    # Look up user by ID from the DB
    from db import get_session
    with get_session() as s:
        from db import User as UserModel
        user = s.query(UserModel).filter(UserModel.id == user_id).first()

    if not user or not user.phone:
        logger.warning("process_evening_reply: user %d not found or has no phone", user_id)
        return

    ai.set_current_user_id(user.id)
    today = _today_for_user(user)
    goals = get_goals(user_id, today)
    if not goals:
        return

    goal_texts = [g.goal_text for g in goals]
    completed = parse_completion_from_reply(reply_text, goal_texts)

    completed_indices = [i + 1 for i, c in enumerate(completed) if c]
    mark_goals_from_reply(user_id, today, completed_indices)

    calculate_and_save_score(user_id, today)

    # Send score message
    goals_set, goals_completed, score = calculate_daily_score(user_id, today)
    streak = get_current_streak(user_id)
    msg = generate_score_message(user.name, goals_set, goals_completed, score, streak)
    if msg:
        send_message(user.phone, msg)


def check_missed_replies():
    """Find unreplied check-ins older than REMINDER_DELAY_MINUTES for ALL users."""
    threshold = datetime.now(timezone.utc) - timedelta(minutes=settings.REMINDER_DELAY_MINUTES)

    for user in get_all_active_users():
        if not user.phone:
            continue
        try:
            ai.set_current_user_id(user.id)
            today = _today_for_user(user)
            pending = get_all_pending_check_ins(user.id, today)

            for ci in pending:
                if ci.check_in_type == "reminder":
                    continue
                if ci.created_at and ci.created_at > threshold:
                    continue
                if get_check_in_exists(user.id, today, f"reminder_{ci.check_in_type}"):
                    continue

                msg = generate_reminder_message(user.name, ci.check_in_type)
                if not msg:
                    msg = f"Hey {user.name}, just a reminder — did you see my {ci.check_in_type} message?"

                sid = send_message(user.phone, msg)
                if sid:
                    save_check_in(user.id, today, f"reminder_{ci.check_in_type}", msg)
                    logger.info("Sent reminder for missed %s check-in to user %d", ci.check_in_type, user.id)
        except Exception:
            logger.exception("Error checking missed replies for user %d", user.id)


def weekly_summary():
    """Generate and send a weekly summary for ALL users."""
    logger.info("Running weekly summary for all users")
    for user in get_all_active_users():
        if not user.phone:
            continue
        try:
            ai.set_current_user_id(user.id)
            scores = get_stats(user.id, days=7)
            weekly_data = [
                {
                    "date": str(s.date),
                    "score": s.score,
                    "goals_set": s.goals_set,
                    "goals_completed": s.goals_completed,
                }
                for s in scores
            ]
            msg = generate_weekly_summary(user.name, weekly_data)
            if msg:
                send_message(user.phone, msg)
                logger.info("Weekly summary sent to user %d", user.id)
        except Exception:
            logger.exception("Error sending weekly summary for user %d", user.id)


def calculate_and_save_score(user_id: int, score_date: date):
    """Compute daily score and streak, save to DB."""
    goals_set, goals_completed, score = calculate_daily_score(user_id, score_date)
    streak = get_current_streak(user_id)
    if score > 0:
        streak += 1  # include today

    notes = f"{goals_completed}/{goals_set} goals completed"
    save_daily_score(user_id, score_date, goals_set, goals_completed, score, streak, notes)
    logger.info(
        "Score saved: %s — %d/%d (%.1f%%), streak=%d",
        score_date, goals_completed, goals_set, score, streak,
    )


# ---------------------------------------------------------------------------
# First run experience
# ---------------------------------------------------------------------------

def _first_run_welcome_for_user(user: User):
    """Send a welcome message to a new user who has no history."""
    ai.set_current_user_id(user.id)
    if not user.phone:
        return

    today = _today_for_user(user)

    if get_check_in_exists(user.id, today, "morning"):
        return

    if get_total_days_tracked(user.id) > 0:
        return

    goals = get_goals(user.id, today)
    if goals:
        return

    msg = (
        f"Hey {user.name}! I'm your accountability partner.\n\n"
        "Every morning I'll ask for your goals, check in at midday, "
        "and every evening we'll review how you did.\n\n"
        "Let's start — *what are your top 3 goals for today?*"
    )
    sid = send_message(user.phone, msg)
    if sid:
        save_check_in(user.id, today, "morning", msg)
        logger.info("Welcome message sent to user %d (first run)", user.id)


def first_run_welcome():
    """Send welcome messages to all new users."""
    for user in get_all_active_users():
        try:
            _first_run_welcome_for_user(user)
        except Exception:
            logger.exception("Error in first_run_welcome for user %d", user.id)


# ---------------------------------------------------------------------------
# Graceful restart — catch up on missed check-ins
# ---------------------------------------------------------------------------

def catch_up_on_restart():
    """If agent restarts mid-day, send any missed check-ins for ALL users."""
    for user in get_all_active_users():
        if not user.phone:
            continue
        try:
            ai.set_current_user_id(user.id)
            today = _today_for_user(user)
            now = _now_local_for_user(user)
            h, m = now.hour, now.minute
            current_minutes = h * 60 + m

            morning_h, morning_m = _parse_time(user.morning_time or settings.MORNING_TIME)
            midday_h, midday_m = _parse_time(user.midday_time or settings.MIDDAY_TIME)
            evening_h, evening_m = _parse_time(user.evening_time or settings.EVENING_TIME)

            morning_mins = morning_h * 60 + morning_m
            midday_mins = midday_h * 60 + midday_m
            evening_mins = evening_h * 60 + evening_m

            if current_minutes >= morning_mins and current_minutes < midday_mins:
                if not get_check_in_exists(user.id, today, "morning"):
                    logger.info("Catch-up: sending missed morning check-in to user %d", user.id)
                    _morning_check_in_for_user(user)

            elif current_minutes >= midday_mins and current_minutes < evening_mins:
                if not get_check_in_exists(user.id, today, "midday"):
                    logger.info("Catch-up: sending missed midday check-in to user %d", user.id)
                    _midday_check_in_for_user(user)

            elif current_minutes >= evening_mins:
                if not get_check_in_exists(user.id, today, "evening"):
                    logger.info("Catch-up: sending missed evening check-in to user %d", user.id)
                    _evening_check_in_for_user(user)
        except Exception:
            logger.exception("Error in catch_up_on_restart for user %d", user.id)


# ---------------------------------------------------------------------------
# Main — start the scheduler
# ---------------------------------------------------------------------------

def main():
    logger.info("=" * 60)
    logger.info("Accountability Agent starting (multi-user mode)")
    logger.info("Mode: %s", settings.MESSAGING_MODE.upper())
    logger.info("Default timezone: %s", settings.USER_TIMEZONE)
    logger.info(
        "Default schedule: morning=%s, midday=%s, evening=%s",
        settings.MORNING_TIME, settings.MIDDAY_TIME, settings.EVENING_TIME,
    )
    logger.info("=" * 60)

    init_db()

    # Ensure legacy user exists if configured
    if settings.USER_WHATSAPP_NUMBER:
        _get_user()

    # Load all active users
    users = get_all_active_users()
    logger.info("Active users: %d", len(users))
    for u in users:
        logger.info("  - %s (id=%d, phone=%s, tz=%s)", u.name, u.id, u.phone or "N/A", u.timezone)

    # First run welcome for all users
    first_run_welcome()

    # Catch up on missed check-ins after restart
    catch_up_on_restart()

    # Set up scheduler — use default timezone for the scheduler itself.
    # The check-in functions iterate all users and respect per-user timezones
    # by checking if it's the right time for each user. We schedule jobs at
    # the default times but the per-user functions skip if already sent.
    scheduler = BlockingScheduler(timezone=_default_tz)

    mh, mm = _parse_time(settings.MORNING_TIME)
    scheduler.add_job(
        morning_check_in,
        CronTrigger(hour=mh, minute=mm, timezone=_default_tz),
        id="morning_check_in",
        name="Morning check-in (all users)",
        misfire_grace_time=3600,
    )

    dh, dm = _parse_time(settings.MIDDAY_TIME)
    scheduler.add_job(
        midday_check_in,
        CronTrigger(hour=dh, minute=dm, timezone=_default_tz),
        id="midday_check_in",
        name="Midday check-in (all users)",
        misfire_grace_time=3600,
    )

    eh, em = _parse_time(settings.EVENING_TIME)
    scheduler.add_job(
        evening_check_in,
        CronTrigger(hour=eh, minute=em, timezone=_default_tz),
        id="evening_check_in",
        name="Evening check-in (all users)",
        misfire_grace_time=3600,
    )

    # Weekly summary: Sunday at EVENING_TIME + 1 hour
    wh = eh + 1 if eh < 23 else 23
    scheduler.add_job(
        weekly_summary,
        CronTrigger(day_of_week="sun", hour=wh, minute=em, timezone=_default_tz),
        id="weekly_summary",
        name="Weekly summary (all users)",
        misfire_grace_time=7200,
    )

    # Check for missed replies every 30 minutes
    scheduler.add_job(
        check_missed_replies,
        "interval",
        minutes=30,
        id="check_missed_replies",
        name="Check missed replies (all users)",
        misfire_grace_time=1800,
    )

    logger.info("Scheduler started — waiting for next job...")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Agent shutting down")
        scheduler.shutdown(wait=False)


if __name__ == "__main__":
    main()
