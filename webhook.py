"""FastAPI server — Twilio webhook + REST API for dashboard."""

import logging
import os
import time
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from agent import calculate_and_save_score, process_evening_reply
import ai
from ai import classify_freeform_message, parse_goals_from_reply
from auth import (
    create_token,
    hash_password,
    verify_google_id_token,
    verify_password,
    verify_token,
)
import billing
from config import settings
from db import (
    VALID_TIERS,
    User,
    admin_summary_stats,
    create_user_with_email,
    create_user_with_google,
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
    get_usage_summary,
    get_user,
    get_user_by_email,
    get_user_by_google_id,
    get_user_by_phone,
    init_db,
    link_google_to_user,
    link_phone_to_user,
    list_users_with_stats,
    log_message,
    mark_goal_completed,
    save_check_in,
    set_goals,
    set_user_admin,
    set_user_tier,
    touch_last_active,
    update_check_in_reply,
    update_user_profile,
)
from whatsapp import send_message, validate_twilio_signature

logger = logging.getLogger(__name__)

# Sentry — no-op if SENTRY_DSN is unset, so safe to leave in.
_sentry_dsn = os.environ.get("SENTRY_DSN", "").strip()
if _sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=os.environ.get("SENTRY_ENV", "production"),
        traces_sample_rate=0.0,  # errors only — turn up later if we want perf data
        send_default_pii=False,
    )
    logger.info("Sentry initialized")

app = FastAPI(title="Accountability Agent API")
_start_time = time.time()

_cors_origins_env = (settings.CORS_ORIGINS or "").strip() if hasattr(settings, "CORS_ORIGINS") else ""
_cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()] or ["*"]
_cors_regex = settings.CORS_ORIGIN_REGEX if hasattr(settings, "CORS_ORIGIN_REGEX") else ""
_allow_credentials = _cors_origins != ["*"] or bool(_cors_regex)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_regex or None,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "uptime_s": int(time.time() - _start_time)}

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


class GoogleAuthRequest(BaseModel):
    # The "credential" string returned by Google Identity Services on the
    # frontend (a signed JWT ID token).
    credential: str


def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "timezone": user.timezone,
        "is_active": user.is_active,
        "nickname": user.nickname,
        "avatar_url": user.avatar_url,
        "is_admin": bool(user.is_admin),
        "tier": user.tier or "free",
        "tier_updated_at": user.tier_updated_at.isoformat() if user.tier_updated_at else None,
        "subscription_status": user.subscription_status,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        "current_period_end": user.current_period_end.isoformat() if user.current_period_end else None,
        "has_stripe_customer": bool(user.stripe_customer_id),
    }


def _sync_admin_from_env(user: User) -> User:
    """Promote/demote `user` based on settings.ADMIN_EMAILS.

    Admin status is fully driven by an env secret — this prevents accidental
    self-lockout from the admin UI, and means rotation is just a deploy.
    Returns the (possibly refreshed) user.
    """
    if not user or not user.email:
        return user
    should_be_admin = user.email.lower() in settings.ADMIN_EMAILS
    if bool(user.is_admin) != should_be_admin:
        updated = set_user_admin(user.id, should_be_admin)
        logger.info(
            "ADMIN_EMAILS sync: %s -> is_admin=%s",
            user.email,
            should_be_admin,
        )
        return updated or user
    return user


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
        user = get_user(user_id)
    if not user:
        return None
    # Heartbeat + env-driven admin sync. Both are cheap (single UPDATE each,
    # only when state actually diverges) and keep the user record honest
    # without requiring re-login.
    try:
        touch_last_active(user.id)
        user = _sync_admin_from_env(user)
    except Exception:
        logger.exception("Failed to refresh user state for user_id=%s", user.id)
    return user


def require_user(request: Request) -> User:
    """FastAPI dependency — 401 if not authenticated."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_admin(request: Request) -> User:
    """FastAPI dependency — 401 unauth / 403 if not admin."""
    user = require_user(request)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
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
    # Ensure avatar directory exists and mount it as static. Done at startup
    # (rather than module-load) so DATABASE_URL / AVATAR_DIR env overrides in
    # tests still take effect.
    avatar_dir = Path(settings.AVATAR_DIR)
    avatar_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/avatars", StaticFiles(directory=str(avatar_dir)), name="avatars")
    logger.info("Webhook server started (avatars at %s)", avatar_dir)


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


@app.post("/api/auth/google")
def auth_google(body: GoogleAuthRequest):
    """Sign in or sign up with a Google ID token (Google Identity Services).

    Flow:
      1. Verify the ID token against Google (sig + aud + exp + verified email).
      2. If a user with this google_id exists → log them in.
      3. Else if a user with this email exists → link google_id, log them in.
      4. Else → create a fresh user with google_id + email + name.

    Returns the same {token, user} shape as /register and /login so the
    frontend can reuse the existing login() callback.

    Response codes:
      200 — success
      400 — malformed request (no credential)
      401 — token failed verification
      503 — Google sign-in not configured on this server
    """
    if not settings.GOOGLE_OAUTH_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured on this server",
        )
    if not body.credential:
        raise HTTPException(status_code=400, detail="Missing Google credential")

    info = verify_google_id_token(body.credential)
    if not info:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    google_id = info["sub"]
    email = info["email"].lower()
    # Google sometimes ships "name", sometimes only "given_name" / "family_name".
    name = (
        info.get("name")
        or " ".join(filter(None, [info.get("given_name"), info.get("family_name")])).strip()
        or email.split("@")[0]
    )

    # 1) Existing Google-bound user → just log them in.
    user = get_user_by_google_id(google_id)

    # 2) Existing email user (signed up with password) → link Google to them.
    if not user:
        existing_by_email = get_user_by_email(email)
        if existing_by_email:
            user = link_google_to_user(existing_by_email.id, google_id) or existing_by_email

    # 3) Brand-new user.
    if not user:
        user = create_user_with_google(google_id, email, name)

    token = create_token(user.id, user.email)
    return {"token": token, "user": _user_to_dict(user)}


@app.get("/api/auth/me")
def auth_me(request: Request):
    """Get current user info from Bearer token."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": _user_to_dict(user)}


@app.get("/api/config")
def public_config():
    """Public, unauthenticated config used by the dashboard onboarding to
    render the right WhatsApp number and Twilio Sandbox opt-in phrase. None
    of these values are secrets — the WhatsApp number is printed on Twilio's
    public docs and the sandbox join code is shown to anyone who lands on
    the sandbox page. Keeping it server-driven means we can rotate the
    sandbox code without redeploying the frontend."""
    whatsapp = settings.TWILIO_WHATSAPP_NUMBER or ""
    # Twilio stores the number as "whatsapp:+14155238886" — strip the prefix
    # so the UI can display it cleanly.
    if whatsapp.startswith("whatsapp:"):
        whatsapp = whatsapp[len("whatsapp:"):]
    return {
        "whatsapp_number": whatsapp,
        "sandbox_join_code": settings.TWILIO_SANDBOX_JOIN_CODE or "",
        "is_sandbox": bool(settings.TWILIO_SANDBOX_JOIN_CODE),
    }


class ProfileUpdateRequest(BaseModel):
    # None = leave unchanged. Empty string = clear (only meaningful for nickname).
    nickname: Optional[str] = Field(default=None, max_length=40)


class AdminUserUpdateRequest(BaseModel):
    tier: Optional[str] = None  # "free" | "premium" | "lifetime"
    is_admin: Optional[bool] = None


@app.patch("/api/profile")
def api_profile_update(body: ProfileUpdateRequest, user: User = Depends(require_user)):
    updated = update_user_profile(user.id, nickname=body.nickname)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": _user_to_dict(updated)}


@app.post("/api/profile/avatar")
async def api_profile_avatar_upload(
    file: UploadFile = File(...),
    user: User = Depends(require_user),
):
    """Upload an avatar. JPEG/PNG/WebP up to MAX_AVATAR_BYTES."""
    content_type = (file.content_type or "").lower()
    if content_type not in settings.ALLOWED_AVATAR_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type or 'unknown'}. Use JPEG, PNG, or WebP.",
        )

    # Stream-read with a hard cap so a huge upload can't blow up memory.
    raw = await file.read(settings.MAX_AVATAR_BYTES + 1)
    if len(raw) > settings.MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {settings.MAX_AVATAR_BYTES // 1024} KB.",
        )
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }[content_type]

    avatar_dir = Path(settings.AVATAR_DIR)
    avatar_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    target = avatar_dir / filename
    target.write_bytes(raw)

    # Best-effort: delete the previous avatar file if it lived in our dir.
    if user.avatar_url and user.avatar_url.startswith("/avatars/"):
        old = avatar_dir / user.avatar_url.removeprefix("/avatars/")
        try:
            if old.is_file() and old.resolve().parent == avatar_dir.resolve():
                old.unlink()
        except OSError:
            logger.warning("Failed to remove old avatar %s", old, exc_info=True)

    url = f"/avatars/{filename}"
    updated = update_user_profile(user.id, avatar_url=url)
    return {"user": _user_to_dict(updated)}


@app.delete("/api/profile/avatar")
def api_profile_avatar_delete(user: User = Depends(require_user)):
    if user.avatar_url and user.avatar_url.startswith("/avatars/"):
        avatar_dir = Path(settings.AVATAR_DIR)
        old = avatar_dir / user.avatar_url.removeprefix("/avatars/")
        try:
            if old.is_file() and old.resolve().parent == avatar_dir.resolve():
                old.unlink()
        except OSError:
            logger.warning("Failed to remove avatar %s", old, exc_info=True)
    updated = update_user_profile(user.id, avatar_url="")
    return {"user": _user_to_dict(updated)}


# ---- Admin -----------------------------------------------------------------

@app.get("/api/admin/users")
def api_admin_users(
    search: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: User = Depends(require_admin),
):
    if tier and tier not in VALID_TIERS:
        raise HTTPException(status_code=400, detail=f"Invalid tier: {tier}")
    rows, total = list_users_with_stats(search=search, tier=tier, limit=limit, offset=offset)
    return {"users": rows, "total": total, "limit": limit, "offset": offset}


@app.patch("/api/admin/users/{user_id}")
def api_admin_user_update(
    user_id: int,
    body: AdminUserUpdateRequest,
    admin: User = Depends(require_admin),
):
    # Self-edit guard: an admin cannot demote themselves or downgrade their own
    # tier via this endpoint. Admin status is sourced from ADMIN_EMAILS anyway,
    # so a UI flip would just bounce back on next /me — but blocking it here
    # makes the rule explicit and avoids the confusing round-trip.
    if user_id == admin.id and body.is_admin is False:
        raise HTTPException(
            status_code=400,
            detail="Cannot revoke your own admin access. Edit ADMIN_EMAILS env var instead.",
        )

    target = get_user(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.tier is not None:
        if body.tier not in VALID_TIERS:
            raise HTTPException(status_code=400, detail=f"Invalid tier: {body.tier}")
        target = set_user_tier(user_id, body.tier)
    if body.is_admin is not None:
        target = set_user_admin(user_id, body.is_admin)

    return {"user": _user_to_dict(target)}


@app.get("/api/admin/stats")
def api_admin_stats(_: User = Depends(require_admin)):
    return admin_summary_stats()


@app.get("/api/admin/usage")
def api_admin_usage(
    days: int = Query(30, ge=1, le=365),
    _: User = Depends(require_admin),
):
    """Anthropic spend summary — totals, per-day, per-model, top users, MTD,
    projected month. Anthropic has no balance API so this is sourced from our
    own api_usage ledger written on every Claude call."""
    return get_usage_summary(days=days)


# ---- Billing (Stripe) ------------------------------------------------------

@app.get("/api/billing/subscribe-url")
def api_billing_subscribe_url(user: User = Depends(require_user)):
    """Return the Stripe Payment Link with this user's attribution params.

    Frontend opens it in a new tab. After payment the webhook flips the user's
    tier; no callback URL needed because Stripe Payment Links handle their own
    success page.
    """
    try:
        url = billing.build_subscribe_url(user)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"url": url}


@app.post("/api/billing/sync")
def api_billing_sync(user: User = Depends(require_user)):
    """Pull the user's current subscription from Stripe and apply it.

    Backstop for missed webhooks. Returns the refreshed user object so the
    frontend can flip the UI immediately without waiting for the next /me.
    """
    if not billing.configured():
        raise HTTPException(status_code=503, detail="Billing is not configured")
    try:
        status = billing.sync_user_subscription(user)
    except Exception as e:
        logger.exception("Failed to sync subscription for user_id=%s", user.id)
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")
    refreshed = get_user(user.id) or user
    return {"status": status, "user": _user_to_dict(refreshed)}


@app.post("/api/billing/portal")
def api_billing_portal(user: User = Depends(require_user)):
    """Create a Stripe Customer Portal session for managing subscription."""
    if not billing.configured():
        raise HTTPException(status_code=503, detail="Billing is not configured")
    try:
        url = billing.create_portal_session(user)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Failed to create Stripe portal session for user_id=%s", user.id)
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")
    return {"url": url}


@app.post("/api/stripe/webhook")
async def api_stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(None, alias="Stripe-Signature"),
):
    """Stripe webhook receiver. Signature-verified, deduplicated, idempotent.

    We always return 200 unless the signature is bad (400) or our handler
    raised unexpectedly (500). Returning 2xx tells Stripe to stop retrying.
    """
    if not billing.configured() or not settings.STRIPE_WEBHOOK_SECRET:
        logger.warning("Stripe webhook hit but secrets are not configured")
        raise HTTPException(status_code=503, detail="Billing is not configured")
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    payload = await request.body()
    try:
        _, status = billing.process_event(payload, stripe_signature)
    except Exception as e:
        # Signature failures + parse failures both end up here. Return 400
        # so Stripe retries (in case it was a transient issue), but log loudly
        # with type + full traceback so a cryptic exception message doesn't
        # hide the actual cause.
        logger.warning(
            "Stripe webhook rejected: %s: %s",
            type(e).__name__,
            e,
            exc_info=True,
        )
        raise HTTPException(status_code=400, detail=f"Webhook error: {type(e).__name__}: {e}")

    return {"received": True, "status": status}


@app.post("/api/auth/link-phone")
def auth_link_phone(request: Request, body: LinkPhoneRequest):
    """Link a WhatsApp phone number to the authenticated user.

    If a phone-only user exists (auto-created via WhatsApp), their data
    is merged into the authenticated user's account automatically.
    """
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Only reject if the phone belongs to another dashboard account (has email)
    existing = get_user_by_phone(body.phone)
    if existing and existing.id != user.id and existing.email:
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
    # Best/worst are only meaningful when we have enough variety to
    # distinguish them. Sampling only one day-of-week (or N days that all
    # average to the same score) makes best == worst — which reads as a bug
    # to users, not as "not enough data". Suppress worst_day in those cases
    # so the UI can show "need more days" copy instead of nonsense.
    distinct_scores = set(day_avgs.values())
    best_day = max(day_avgs, key=day_avgs.get) if day_avgs else None
    if len(day_avgs) >= 2 and len(distinct_scores) >= 2:
        worst_day = min(day_avgs, key=day_avgs.get)
    else:
        worst_day = None

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
    NumMedia: str = Form("0"),
    MediaUrl0: str = Form(""),
    MediaContentType0: str = Form(""),
    x_twilio_signature: str | None = Header(None, alias="X-Twilio-Signature"),
):
    """Handle inbound WhatsApp messages from Twilio (text + voice notes)."""

    if x_twilio_signature:
        form_data = dict(await request.form())
        # Reconstruct the public URL Twilio signed against. Behind Fly's proxy
        # request.url shows http://internal; Twilio computed the HMAC over the
        # public https://splash-accountability-api.fly.dev URL.
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
        url = f"{proto}://{host}{request.url.path}"
        if request.url.query:
            url = f"{url}?{request.url.query}"
        if not validate_twilio_signature(x_twilio_signature, url, form_data):
            logger.warning("Invalid Twilio signature from %s (url=%s)", From, url)
            return Response(content="<Response></Response>", media_type="application/xml", status_code=403)

    phone = From.replace("whatsapp:", "").strip()
    body = Body.strip()

    # Handle voice notes: transcribe audio and use transcript as the message body
    if int(NumMedia) > 0 and MediaUrl0 and MediaContentType0.startswith("audio/"):
        logger.info("Voice note received from %s (%s, %s)", phone, MediaContentType0, MediaUrl0)
        from whatsapp import download_twilio_media
        from ai import transcribe_audio

        audio_data = download_twilio_media(MediaUrl0)
        if audio_data:
            transcript = transcribe_audio(audio_data, MediaContentType0)
            if transcript:
                # Use transcript as the message body (append to any caption text)
                body = f"{body} {transcript}".strip() if body else transcript
                logger.info("Voice note transcribed for %s: %s", phone, transcript[:100])
            else:
                # Transcription failed — tell the user
                from whatsapp import send_message as _send
                _send(phone, "I couldn't understand that voice note. Could you try sending it as text?", is_reply=True)
                return Response(content="<Response></Response>", media_type="application/xml")
        else:
            from whatsapp import send_message as _send
            _send(phone, "I had trouble downloading your voice note. Could you try again?", is_reply=True)
            return Response(content="<Response></Response>", media_type="application/xml")

    if not phone or not body:
        return Response(content="<Response></Response>", media_type="application/xml")

    logger.info("Inbound from %s: %s", phone, body[:100])

    user = get_user_by_phone(phone)
    if not user:
        user = get_or_create_user(phone, phone, settings.USER_TIMEZONE)

    # Attribute any Claude calls made downstream in this request to this user
    # so the api_usage ledger shows accurate per-user spend.
    ai.set_current_user_id(user.id)

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
            send_message(phone, reply, is_reply=True)

        elif pending.check_in_type == "midday":
            reply = f"Thanks for the update, {user.name}! Keep pushing through the afternoon."
            send_message(phone, reply, is_reply=True)

        elif pending.check_in_type == "evening":
            process_evening_reply(user.id, body)

        else:
            if "morning" in pending.check_in_type:
                goals = parse_goals_from_reply(body)
                if goals:
                    set_goals(user.id, today, goals)
                    goals_formatted = "\n".join(f"{i}. {g}" for i, g in enumerate(goals, 1))
                    reply = f"Better late than never! Your goals:\n{goals_formatted}\n\nLet's make it happen!"
                    send_message(phone, reply, is_reply=True)
            elif "evening" in pending.check_in_type:
                process_evening_reply(user.id, body)
            else:
                send_message(phone, f"Noted, {user.name}! Keep going.", is_reply=True)
    else:
        # No pending check-in — use AI to understand the message
        existing_goals = [g.goal_text for g in get_goals(user.id, today)]
        result = classify_freeform_message(body, user.name, existing_goals, str(today))

        # Use the AI-detected date if the user referenced a past day (e.g. "on Friday")
        target_date = today
        if result.get("date"):
            try:
                target_date = date.fromisoformat(result["date"])
                if target_date > today:
                    target_date = today  # don't allow future dates
                logger.info("Date reference detected: %s (today=%s)", target_date, today)
            except ValueError:
                target_date = today

        if result["intent"] == "set_goals" and result.get("goals"):
            goals = result["goals"]
            set_goals(user.id, target_date, goals)
            goals_formatted = "\n".join(f"{i}. {g}" for i, g in enumerate(goals, 1))
            date_label = f"for {target_date.strftime('%A %b %d')}" if target_date != today else "for today"
            reply = result.get("reply") or (
                f"Got it! Your {len(goals)} goal{'s' if len(goals) != 1 else ''} "
                f"{date_label}:\n{goals_formatted}\n\nLet's make it happen!"
            )
            send_message(phone, reply, is_reply=True)

        elif result["intent"] == "report_completions" and result.get("completed") and existing_goals:
            completed_flags = result["completed"]
            for i, (goal_text, done) in enumerate(zip(existing_goals, completed_flags)):
                if done:
                    mark_goal_completed(user.id, target_date, i + 1)
            score_info = calculate_and_save_score(user.id, target_date)
            reply = result.get("reply") or (
                f"Nice work, {user.name}! Score: *{score_info['score']:.0f}%*"
            )
            send_message(phone, reply, is_reply=True)

        elif result["intent"] == "report_achievements" and result.get("goals"):
            # User reported achievements — save as completed goals for the target date
            goals = result["goals"]
            set_goals(user.id, target_date, goals)
            for i in range(1, len(goals) + 1):
                mark_goal_completed(user.id, target_date, i)
            score_info = calculate_and_save_score(user.id, target_date)
            date_label = f"for {target_date.strftime('%A %b %d')}" if target_date != today else ""
            reply = result.get("reply") or (
                f"Logged {len(goals)} achievement{'s' if len(goals) != 1 else ''} {date_label}! "
                f"Score: *{score_info['score']:.0f}%* "
            )
            send_message(phone, reply, is_reply=True)

        else:
            reply = result.get("reply") or f"Hey {user.name}! I'll check in with you at your next scheduled time."
            send_message(phone, reply, is_reply=True)

    return Response(content="<Response></Response>", media_type="application/xml")
