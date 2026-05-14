"""FastAPI server — Twilio webhook + REST API for dashboard."""

import logging
import time
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Form, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import calculate_and_save_score, process_evening_reply
from ai import parse_goals_from_reply
from auth import create_token, hash_password, verify_password, verify_token
from config import settings
from db import (
    User,
    create_user_with_email,
    get_all_scores,
    get_current_streak,
    get_first_user,
    get_goals,
    get_goals_in_range,
    get_latest_pending_check_in,
    get_or_create_user,
    get_score_for_date,
    get_stats,
    get_total_days_tracked,
    get_user_by_email,
    get_user_by_phone,
    init_db,
    link_phone_to_user,
    log_message,
    save_check_in,
    set_goals,
    update_check_in_reply,
)
from whatsapp import send_message, validate_twilio_signature

logger = logging.getLogger(__name__)

app = FastAPI(title="Accountability Agent API")
_start_time = time.time()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_user_tz = ZoneInfo(settings.USER_TIMEZONE)


def _today() -> date:
    return datetime.now(_user_tz).date()


# ===================================================================
# Auth models
# ===================================================================

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class LinkPhoneRequest(BaseModel):
    phone: str


def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "timezone": user.timezone,
        "is_active": user.is_active,
    }


# ===================================================================
# Auth dependency
# ===================================================================

def get_current_user(request: Request) -> Optional[User]:
    """Extract and verify Bearer token from request. Returns User or None."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    payload = verify_token(token)
    if not payload:
        return None
    user_id = int(payload["sub"])
    email = payload.get("email", "")
    if email:
        user = get_user_by_email(email)
    else:
        user = None
    return user


def _get_user_or_fallback(request: Request) -> Optional[User]:
    """Try Bearer token first, fall back to get_first_user() for backwards compat."""
    user = get_current_user(request)
    if user:
        return user
    return get_first_user()


@app.on_event("startup")
def startup():
    init_db()
    logger.info("Webhook server started")


# ===================================================================
# Health
# ===================================================================

@app.get("/health")
def health():
    uptime_s = int(time.time() - _start_time)
    hours, remainder = divmod(uptime_s, 3600)
    minutes, secs = divmod(remainder, 60)

    db_ok = False
    try:
        from sqlalchemy import text as sa_text
        from db import engine
        with engine.connect() as conn:
            conn.execute(sa_text("SELECT 1"))
            db_ok = True
    except Exception:
        logger.exception("Health check: DB unreachable")

    return {
        "status": "ok",
        "db": db_ok,
        "uptime": f"{hours}h {minutes}m {secs}s",
    }


# ===================================================================
# Auth endpoints
# ===================================================================

@app.post("/api/auth/register")
def auth_register(body: RegisterRequest):
    """Register a new user with email and password."""
    existing = get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    pw_hash = hash_password(body.password)
    user = create_user_with_email(body.email, pw_hash, body.name, body.phone)
    token = create_token(user.id, user.email)
    return {"token": token, "user": _user_to_dict(user)}


@app.post("/api/auth/login")
def auth_login(body: LoginRequest):
    """Login with email and password, returns JWT token."""
    user = get_user_by_email(body.email)
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user.id, user.email)
    return {"token": token, "user": _user_to_dict(user)}


@app.get("/api/auth/me")
def auth_me(request: Request):
    """Get current user info from Bearer token."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": _user_to_dict(user)}


@app.post("/api/auth/link-phone")
def auth_link_phone(request: Request, body: LinkPhoneRequest):
    """Link a WhatsApp phone number to the authenticated user."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Check if phone is already taken by another user
    existing = get_user_by_phone(body.phone)
    if existing and existing.id != user.id:
        raise HTTPException(status_code=400, detail="Phone number already linked to another account")

    link_phone_to_user(user.id, body.phone)
    # Refresh user
    updated_user = get_user_by_email(user.email)
    return {"user": _user_to_dict(updated_user)}


# ===================================================================
# Dashboard API
# ===================================================================

@app.get("/api/overview")
def api_overview(request: Request):
    user = _get_user_or_fallback(request)
    if not user:
        return {"error": "no_user"}

    today = _today()
    streak = get_current_streak(user.id)
    today_score = get_score_for_date(user.id, today)
    stats_7 = get_stats(user.id, days=7)
    total_days = get_total_days_tracked(user.id)
    avg_7 = sum(s.score for s in stats_7) / len(stats_7) if stats_7 else 0

    return {
        "user_name": user.name,
        "streak": streak,
        "today_score": today_score.score if today_score else None,
        "today_goals_set": today_score.goals_set if today_score else 0,
        "today_goals_completed": today_score.goals_completed if today_score else 0,
        "avg_7": round(avg_7, 1),
        "total_days": total_days,
    }


@app.get("/api/scores")
def api_scores(request: Request, days: int = Query(30)):
    user = _get_user_or_fallback(request)
    if not user:
        return []
    scores = get_stats(user.id, days=days)
    return [
        {
            "date": str(s.date),
            "score": s.score,
            "goals_set": s.goals_set,
            "goals_completed": s.goals_completed,
            "streak": s.streak_day,
        }
        for s in scores
    ]


@app.get("/api/goals")
def api_goals(
    request: Request,
    start: str = Query(None),
    end: str = Query(None),
    filter: str = Query("all"),
):
    user = _get_user_or_fallback(request)
    if not user:
        return []

    today = _today()
    start_date = date.fromisoformat(start) if start else today - timedelta(days=30)
    end_date = date.fromisoformat(end) if end else today

    goals = get_goals_in_range(user.id, start_date, end_date)

    if filter == "completed":
        goals = [g for g in goals if g.is_completed]
    elif filter == "incomplete":
        goals = [g for g in goals if not g.is_completed]

    return [
        {
            "date": str(g.date),
            "goal_number": g.goal_number,
            "goal_text": g.goal_text,
            "is_completed": g.is_completed,
        }
        for g in goals
    ]


@app.get("/api/weekly")
def api_weekly(request: Request, week_start: str = Query(None)):
    user = _get_user_or_fallback(request)
    if not user:
        return {"days": [], "avg": 0}

    today = _today()
    if week_start:
        ws = date.fromisoformat(week_start)
    else:
        ws = today - timedelta(days=today.weekday())  # this week's Monday

    days = []
    for i in range(7):
        d = ws + timedelta(days=i)
        sc = get_score_for_date(user.id, d)
        days.append({
            "date": str(d),
            "day_name": d.strftime("%A"),
            "day_short": d.strftime("%a"),
            "score": sc.score if sc else None,
            "goals_set": sc.goals_set if sc else 0,
            "goals_completed": sc.goals_completed if sc else 0,
            "streak": sc.streak_day if sc else 0,
        })

    scored = [d for d in days if d["score"] is not None]
    avg = sum(d["score"] for d in scored) / len(scored) if scored else 0

    return {"days": days, "avg": round(avg, 1), "week_start": str(ws)}


@app.get("/api/weeks")
def api_weeks(request: Request):
    """List all available weeks for the dropdown."""
    user = _get_user_or_fallback(request)
    if not user:
        return []
    all_scores = get_all_scores(user.id)
    if not all_scores:
        return []

    first = all_scores[0].date
    last = all_scores[-1].date
    first_monday = first - timedelta(days=first.weekday())

    weeks = []
    current = first_monday
    while current <= last:
        weeks.append(str(current))
        current += timedelta(days=7)

    weeks.reverse()
    return weeks


@app.get("/api/trends")
def api_trends(request: Request, days: int = Query(30)):
    user = _get_user_or_fallback(request)
    if not user:
        return {}

    today = _today()
    scores = get_stats(user.id, days=days)
    all_scores = get_all_scores(user.id)

    if not scores:
        return {"scores": [], "best_streak": 0, "best_day": None, "worst_day": None, "avg_goals": 0, "by_position": []}

    # Best streak ever
    best_streak = max((s.streak_day for s in all_scores), default=0) if all_scores else 0

    # Day-of-week analysis
    from collections import defaultdict
    day_scores = defaultdict(list)
    for s in scores:
        day_scores[s.date.strftime("%A")].append(s.score)

    day_avgs = {d: round(sum(v) / len(v), 1) for d, v in day_scores.items()}
    best_day = max(day_avgs, key=day_avgs.get) if day_avgs else None
    worst_day = min(day_avgs, key=day_avgs.get) if day_avgs else None

    avg_goals = round(sum(s.goals_set for s in scores) / len(scores), 1)

    # Completion by goal position
    goals_all = get_goals_in_range(user.id, today - timedelta(days=days), today)
    pos_stats = defaultdict(lambda: {"total": 0, "completed": 0})
    for g in goals_all:
        pos = g.goal_number or 1
        pos_stats[pos]["total"] += 1
        if g.is_completed:
            pos_stats[pos]["completed"] += 1

    by_position = [
        {
            "position": pos,
            "rate": round(s["completed"] / s["total"] * 100, 1) if s["total"] > 0 else 0,
            "total": s["total"],
            "completed": s["completed"],
        }
        for pos, s in sorted(pos_stats.items())
    ]

    return {
        "scores": [{"date": str(s.date), "score": s.score} for s in scores],
        "best_streak": best_streak,
        "best_day": best_day,
        "best_day_avg": day_avgs.get(best_day, 0) if best_day else 0,
        "worst_day": worst_day,
        "worst_day_avg": day_avgs.get(worst_day, 0) if worst_day else 0,
        "avg_goals": avg_goals,
        "by_position": by_position,
        "day_avgs": day_avgs,
    }


# ===================================================================
# Twilio Webhook
# ===================================================================

@app.post("/webhook")
async def twilio_webhook(
    request: Request,
    From: str = Form(""),
    Body: str = Form(""),
    MessageSid: str = Form(""),
    x_twilio_signature: str | None = Header(None, alias="X-Twilio-Signature"),
):
    """Handle inbound WhatsApp messages from Twilio."""

    if x_twilio_signature:
        form_data = dict(await request.form())
        url = str(request.url)
        if not validate_twilio_signature(x_twilio_signature, url, form_data):
            logger.warning("Invalid Twilio signature from %s", From)
            return Response(content="<Response></Response>", media_type="application/xml", status_code=403)

    phone = From.replace("whatsapp:", "").strip()
    body = Body.strip()

    if not phone or not body:
        return Response(content="<Response></Response>", media_type="application/xml")

    logger.info("Inbound from %s: %s", phone, body[:100])

    user = get_user_by_phone(phone)
    if not user:
        user = get_or_create_user(phone, phone, settings.USER_TIMEZONE)

    log_message(user.id, "inbound", body, MessageSid)

    today = _today()
    pending = get_latest_pending_check_in(user.id, today)

    if pending:
        update_check_in_reply(pending.id, body)

        if pending.check_in_type == "morning":
            goals = parse_goals_from_reply(body)
            if goals:
                set_goals(user.id, today, goals)
                goals_formatted = "\n".join(f"{i}. {g}" for i, g in enumerate(goals, 1))
                reply = (
                    f"Got it! Your {len(goals)} goal{'s' if len(goals) != 1 else ''} "
                    f"for today:\n{goals_formatted}\n\nI'll check in with you later. Let's crush it!"
                )
            else:
                reply = "I couldn't quite parse your goals. Try listing them like:\n1. Goal one\n2. Goal two\n3. Goal three"
            send_message(phone, reply)

        elif pending.check_in_type == "midday":
            reply = f"Thanks for the update, {user.name}! Keep pushing through the afternoon."
            send_message(phone, reply)

        elif pending.check_in_type == "evening":
            process_evening_reply(user.id, body)

        else:
            if "morning" in pending.check_in_type:
                goals = parse_goals_from_reply(body)
                if goals:
                    set_goals(user.id, today, goals)
                    goals_formatted = "\n".join(f"{i}. {g}" for i, g in enumerate(goals, 1))
                    reply = f"Better late than never! Your goals:\n{goals_formatted}\n\nLet's make it happen!"
                    send_message(phone, reply)
            elif "evening" in pending.check_in_type:
                process_evening_reply(user.id, body)
            else:
                send_message(phone, f"Noted, {user.name}! Keep going.")
    else:
        send_message(phone, f"Noted, {user.name}! I'll check in with you at your next scheduled time.")

    return Response(content="<Response></Response>", media_type="application/xml")
