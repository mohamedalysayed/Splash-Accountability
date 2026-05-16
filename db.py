"""Database models and helper functions — SQLAlchemy with SQLite."""

import logging
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    desc,
    func,
    text as sa_text,
)
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

from config import settings

logger = logging.getLogger(__name__)

Base = declarative_base()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    phone = Column(Text, unique=True, nullable=True)
    name = Column(Text, nullable=False)
    email = Column(Text, unique=True, nullable=True)
    password_hash = Column(Text, nullable=True)
    timezone = Column(Text, default="Europe/Zurich")
    morning_time = Column(Text, default="08:00")
    midday_time = Column(Text, default="13:00")
    evening_time = Column(Text, default="19:00")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)

    # Profile (P1 — added 2026-05-16)
    nickname = Column(Text, nullable=True)
    avatar_url = Column(Text, nullable=True)  # e.g. /avatars/<uuid>.jpg

    # Admin & subscription (P1)
    is_admin = Column(Boolean, nullable=False, default=False)
    tier = Column(Text, nullable=False, default="free")  # free | premium | lifetime
    tier_updated_at = Column(DateTime, nullable=True)
    last_active_at = Column(DateTime, nullable=True)

    # Google OAuth — the "sub" claim from Google's ID token. Set when the user
    # signs in with Google. A user may have google_id, password_hash, both, or
    # neither (phone-only WhatsApp auto-create). Unique so the same Google
    # account can't bind to two Splash users.
    google_id = Column(Text, nullable=True, unique=True)

    # Stripe subscription state — cached from Stripe webhooks. Treat Stripe
    # as the source of truth; these columns are only for fast lookups + UI.
    stripe_customer_id = Column(Text, nullable=True, unique=True)
    stripe_subscription_id = Column(Text, nullable=True)
    subscription_status = Column(Text, nullable=True)  # trialing|active|past_due|canceled|incomplete|...
    trial_ends_at = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)

    goals = relationship("Goal", back_populates="user")
    check_ins = relationship("CheckIn", back_populates="user")
    daily_scores = relationship("DailyScore", back_populates="user")
    messages = relationship("MessageLog", back_populates="user")


# Indexes for admin filtering / activity queries
Index("ix_users_tier", User.tier)
Index("ix_users_last_active_at", User.last_active_at)
Index("ix_users_stripe_customer_id", User.stripe_customer_id)
Index("ix_users_google_id", User.google_id)


class StripeEvent(Base):
    """Idempotency table for Stripe webhook events.

    Stripe retries failed webhook deliveries for up to 3 days; the same
    event_id can hit us multiple times. We insert here first; if the insert
    succeeds the event is new and we process it. Otherwise we ack-and-skip.
    """
    __tablename__ = "stripe_events"
    event_id = Column(Text, primary_key=True)
    event_type = Column(Text, nullable=True)
    received_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    goal_text = Column(Text, nullable=False)
    goal_number = Column(Integer)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("user_id", "date", "goal_number", name="uq_user_date_goal"),
    )

    user = relationship("User", back_populates="goals")


class CheckIn(Base):
    __tablename__ = "check_ins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    check_in_type = Column(Text, nullable=False)  # morning, midday, evening, reminder
    message_sent = Column(Text)
    user_reply = Column(Text)
    replied_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="check_ins")


class DailyScore(Base):
    __tablename__ = "daily_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    goals_set = Column(Integer, default=0)
    goals_completed = Column(Integer, default=0)
    score = Column(Float, default=0.0)
    streak_day = Column(Integer, default=0)
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_user_date_score"),
    )

    user = relationship("User", back_populates="daily_scores")


class MessageLog(Base):
    __tablename__ = "message_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    direction = Column(Text, nullable=False)  # inbound / outbound
    body = Column(Text, nullable=False)
    twilio_sid = Column(Text)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="messages")


class ApiUsage(Base):
    """One row per Anthropic API call. Anthropic has no balance API, so we
    log every call's token usage + computed USD cost so the admin dashboard
    can show running spend, projected monthly cost, and top users by cost.
    user_id is nullable for system-level calls (e.g. scheduled batches that
    don't belong to a specific user). Indexed on (created_at) for the daily
    rollup query and (user_id) for per-user top-N reports."""

    __tablename__ = "api_usage"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    model = Column(Text, nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    # Stored as USD (float). We compute on insert via the PRICES table in
    # ai.py — keeping it denormalized means historical rows survive a
    # future price change. If Anthropic drops prices we won't retroactively
    # discount our own ledger, which is the safer accounting direction.
    cost_usd = Column(Float, nullable=False, default=0.0)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )


# ---------------------------------------------------------------------------
# Engine & session
# ---------------------------------------------------------------------------

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def _migrate_user_columns():
    """Idempotent additive migrations for the users table.

    SQLite-specific (uses PRAGMA + ALTER TABLE ADD COLUMN). When we move to
    Postgres, swap to information_schema + ALTER TABLE IF NOT EXISTS — same
    spirit, different syntax.
    """
    if not str(engine.url).startswith("sqlite"):
        # On non-SQLite, rely on a real migration tool (alembic). Skip silently.
        return
    additions = [
        ("nickname", "TEXT"),
        ("avatar_url", "TEXT"),
        ("is_admin", "BOOLEAN NOT NULL DEFAULT 0"),
        ("tier", "TEXT NOT NULL DEFAULT 'free'"),
        ("tier_updated_at", "TIMESTAMP"),
        ("last_active_at", "TIMESTAMP"),
        ("stripe_customer_id", "TEXT"),
        ("stripe_subscription_id", "TEXT"),
        ("subscription_status", "TEXT"),
        ("trial_ends_at", "TIMESTAMP"),
        ("current_period_end", "TIMESTAMP"),
        ("google_id", "TEXT"),
    ]
    with engine.begin() as conn:
        existing = {row[1] for row in conn.execute(sa_text("PRAGMA table_info(users)"))}
        for col, ddl in additions:
            if col not in existing:
                conn.execute(sa_text(f"ALTER TABLE users ADD COLUMN {col} {ddl}"))
                logger.info("Migrated users: added column %s", col)


def init_db():
    """Create all tables if they don't exist, then run additive migrations."""
    Base.metadata.create_all(engine)
    _migrate_user_columns()
    logger.info("Database initialized.")


@contextmanager
def get_session():
    """Yield a DB session and handle commit/rollback."""
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def get_or_create_user(phone: str, name: str, tz: str = "Europe/Zurich") -> User:
    with get_session() as s:
        user = s.query(User).filter(User.phone == phone).first()
        if user:
            return user
        user = User(
            phone=phone,
            name=name,
            timezone=tz,
            morning_time=settings.MORNING_TIME,
            midday_time=settings.MIDDAY_TIME,
            evening_time=settings.EVENING_TIME,
        )
        s.add(user)
        s.flush()
        logger.info("Created user %s (%s)", name, phone)
        return user


def get_user_by_phone(phone: str) -> Optional[User]:
    with get_session() as s:
        return s.query(User).filter(User.phone == phone).first()


def set_goals(user_id: int, goal_date: date, goals_list: list[str]):
    """Store a list of goal strings for the given date, replacing any existing."""
    with get_session() as s:
        s.query(Goal).filter(Goal.user_id == user_id, Goal.date == goal_date).delete()
        for i, text in enumerate(goals_list, start=1):
            s.add(Goal(
                user_id=user_id,
                date=goal_date,
                goal_text=text.strip(),
                goal_number=i,
            ))
        logger.info("Set %d goals for user %d on %s", len(goals_list), user_id, goal_date)


def get_goals(user_id: int, goal_date: date) -> list[Goal]:
    with get_session() as s:
        return (
            s.query(Goal)
            .filter(Goal.user_id == user_id, Goal.date == goal_date)
            .order_by(Goal.goal_number)
            .all()
        )


def mark_goal_completed(user_id: int, goal_date: date, goal_number: int):
    with get_session() as s:
        goal = (
            s.query(Goal)
            .filter(
                Goal.user_id == user_id,
                Goal.date == goal_date,
                Goal.goal_number == goal_number,
            )
            .first()
        )
        if goal:
            goal.is_completed = True
            goal.completed_at = datetime.now(timezone.utc)


def mark_goals_from_reply(user_id: int, goal_date: date, completed_indices: list[int]):
    """Mark goals as completed by their 1-based indices."""
    for idx in completed_indices:
        mark_goal_completed(user_id, goal_date, idx)


def save_check_in(
    user_id: int,
    check_date: date,
    check_in_type: str,
    message_sent: str,
    user_reply: Optional[str] = None,
) -> int:
    with get_session() as s:
        ci = CheckIn(
            user_id=user_id,
            date=check_date,
            check_in_type=check_in_type,
            message_sent=message_sent,
            user_reply=user_reply,
            replied_at=datetime.now(timezone.utc) if user_reply else None,
        )
        s.add(ci)
        s.flush()
        return ci.id


def update_check_in_reply(check_in_id: int, user_reply: str):
    with get_session() as s:
        ci = s.query(CheckIn).get(check_in_id)
        if ci:
            ci.user_reply = user_reply
            ci.replied_at = datetime.now(timezone.utc)


def get_pending_check_in(user_id: int, check_date: date, check_in_type: str) -> Optional[CheckIn]:
    """Find the most recent unreplied check-in of the given type for today."""
    with get_session() as s:
        return (
            s.query(CheckIn)
            .filter(
                CheckIn.user_id == user_id,
                CheckIn.date == check_date,
                CheckIn.check_in_type == check_in_type,
                CheckIn.user_reply.is_(None),
            )
            .order_by(desc(CheckIn.created_at))
            .first()
        )


def get_latest_pending_check_in(user_id: int, check_date: date) -> Optional[CheckIn]:
    """Find the most recent unreplied check-in of ANY type for today."""
    with get_session() as s:
        return (
            s.query(CheckIn)
            .filter(
                CheckIn.user_id == user_id,
                CheckIn.date == check_date,
                CheckIn.user_reply.is_(None),
                CheckIn.check_in_type.in_(["morning", "midday", "evening"]),
            )
            .order_by(desc(CheckIn.created_at))
            .first()
        )


def get_all_pending_check_ins(user_id: int, check_date: date) -> list[CheckIn]:
    """All unreplied check-ins for today (for reminder logic)."""
    with get_session() as s:
        return (
            s.query(CheckIn)
            .filter(
                CheckIn.user_id == user_id,
                CheckIn.date == check_date,
                CheckIn.user_reply.is_(None),
            )
            .order_by(CheckIn.created_at)
            .all()
        )


def calculate_daily_score(user_id: int, goal_date: date) -> tuple[int, int, float]:
    """Returns (goals_set, goals_completed, percentage)."""
    with get_session() as s:
        goals = (
            s.query(Goal)
            .filter(Goal.user_id == user_id, Goal.date == goal_date)
            .all()
        )
        total = len(goals)
        completed = sum(1 for g in goals if g.is_completed)
        pct = (completed / total * 100) if total > 0 else 0.0
        return total, completed, round(pct, 1)


def save_daily_score(
    user_id: int,
    score_date: date,
    goals_set: int,
    goals_completed: int,
    score: float,
    streak: int,
    notes: Optional[str] = None,
):
    with get_session() as s:
        existing = (
            s.query(DailyScore)
            .filter(DailyScore.user_id == user_id, DailyScore.date == score_date)
            .first()
        )
        if existing:
            existing.goals_set = goals_set
            existing.goals_completed = goals_completed
            existing.score = score
            existing.streak_day = streak
            existing.notes = notes
        else:
            s.add(DailyScore(
                user_id=user_id,
                date=score_date,
                goals_set=goals_set,
                goals_completed=goals_completed,
                score=score,
                streak_day=streak,
                notes=notes,
            ))


def get_current_streak(user_id: int) -> int:
    """Count consecutive days (ending yesterday or today) with score > 0."""
    with get_session() as s:
        scores = (
            s.query(DailyScore)
            .filter(DailyScore.user_id == user_id, DailyScore.score > 0)
            .order_by(desc(DailyScore.date))
            .all()
        )
        if not scores:
            return 0
        streak = 0
        expected = date.today()
        for sc in scores:
            if sc.date == expected:
                streak += 1
                expected = date.fromordinal(expected.toordinal() - 1)
            elif sc.date == date.fromordinal(expected.toordinal() - 1):
                # allow checking from today or yesterday
                expected = sc.date
                streak += 1
                expected = date.fromordinal(expected.toordinal() - 1)
            else:
                break
        return streak


def get_yesterday_score(user_id: int) -> Optional[DailyScore]:
    yesterday = date.fromordinal(date.today().toordinal() - 1)
    with get_session() as s:
        return (
            s.query(DailyScore)
            .filter(DailyScore.user_id == user_id, DailyScore.date == yesterday)
            .first()
        )


def get_stats(user_id: int, days: int = 30) -> list[DailyScore]:
    with get_session() as s:
        cutoff = date.fromordinal(date.today().toordinal() - days)
        return (
            s.query(DailyScore)
            .filter(DailyScore.user_id == user_id, DailyScore.date >= cutoff)
            .order_by(DailyScore.date)
            .all()
        )


def get_score_for_date(user_id: int, score_date: date) -> Optional[DailyScore]:
    with get_session() as s:
        return (
            s.query(DailyScore)
            .filter(DailyScore.user_id == user_id, DailyScore.date == score_date)
            .first()
        )


def log_message(user_id: int, direction: str, body: str, twilio_sid: Optional[str] = None):
    with get_session() as s:
        s.add(MessageLog(
            user_id=user_id,
            direction=direction,
            body=body,
            twilio_sid=twilio_sid,
        ))


def get_check_in_exists(user_id: int, check_date: date, check_in_type: str) -> bool:
    """Check if a check-in of this type was already sent today."""
    with get_session() as s:
        return (
            s.query(CheckIn)
            .filter(
                CheckIn.user_id == user_id,
                CheckIn.date == check_date,
                CheckIn.check_in_type == check_in_type,
            )
            .count()
            > 0
        )


def get_last_outbound_timestamp(user_id: int) -> Optional[datetime]:
    """Get timestamp of last outbound message for rate limiting."""
    with get_session() as s:
        msg = (
            s.query(MessageLog)
            .filter(MessageLog.user_id == user_id, MessageLog.direction == "outbound")
            .order_by(desc(MessageLog.timestamp))
            .first()
        )
        return msg.timestamp if msg else None


def get_goals_in_range(user_id: int, start: date, end: date) -> list[Goal]:
    with get_session() as s:
        return (
            s.query(Goal)
            .filter(Goal.user_id == user_id, Goal.date >= start, Goal.date <= end)
            .order_by(Goal.date, Goal.goal_number)
            .all()
        )


def get_all_scores(user_id: int) -> list[DailyScore]:
    with get_session() as s:
        return (
            s.query(DailyScore)
            .filter(DailyScore.user_id == user_id)
            .order_by(DailyScore.date)
            .all()
        )


def get_total_days_tracked(user_id: int) -> int:
    with get_session() as s:
        return (
            s.query(func.count(DailyScore.id))
            .filter(DailyScore.user_id == user_id)
            .scalar()
            or 0
        )


def get_user_by_email(email: str) -> Optional[User]:
    """Get a user by email address."""
    with get_session() as s:
        return s.query(User).filter(User.email == email).first()


def create_user_with_email(
    email: str, password_hash: str, name: str, phone: Optional[str] = None
) -> User:
    """Create a new user with email-based authentication."""
    with get_session() as s:
        user = User(
            email=email,
            password_hash=password_hash,
            name=name,
            phone=phone,
            timezone=settings.USER_TIMEZONE,
            morning_time=settings.MORNING_TIME,
            midday_time=settings.MIDDAY_TIME,
            evening_time=settings.EVENING_TIME,
        )
        s.add(user)
        s.flush()
        logger.info("Created user %s (%s)", name, email)
        return user


def get_user_by_google_id(google_id: str) -> Optional[User]:
    """Look up a user by their Google `sub` claim."""
    with get_session() as s:
        return s.query(User).filter(User.google_id == google_id).first()


def create_user_with_google(
    google_id: str, email: str, name: str
) -> User:
    """Create a new user from a verified Google ID token.

    No password_hash is set — they will sign in via Google going forward
    (they can also use "Forgot password" later to add a password if we add
    that flow). Email comes from Google's verified email claim.
    """
    with get_session() as s:
        user = User(
            email=email,
            google_id=google_id,
            name=name,
            timezone=settings.USER_TIMEZONE,
            morning_time=settings.MORNING_TIME,
            midday_time=settings.MIDDAY_TIME,
            evening_time=settings.EVENING_TIME,
        )
        s.add(user)
        s.flush()
        logger.info("Created Google user %s (%s)", name, email)
        return user


def link_google_to_user(user_id: int, google_id: str) -> Optional[User]:
    """Attach a Google sub to an existing user (e.g. a user who originally
    signed up with email/password and is now signing in with Google for the
    first time)."""
    with get_session() as s:
        u = s.query(User).filter(User.id == user_id).first()
        if not u:
            return None
        u.google_id = google_id
        s.flush()
        logger.info("Linked Google id to user %d (%s)", user_id, u.email)
        return u


def link_phone_to_user(user_id: int, phone: str):
    """Link a phone number to a user, merging data from any phone-only user."""
    with get_session() as s:
        target = s.query(User).filter(User.id == user_id).first()
        if not target:
            return

        # Find the WhatsApp-auto-created user with this phone
        phone_user = s.query(User).filter(
            User.phone == phone,
            User.id != user_id,
        ).first()

        if phone_user:
            # Transfer all data from phone_user to target
            s.query(Goal).filter(Goal.user_id == phone_user.id).update(
                {"user_id": user_id}, synchronize_session="fetch"
            )
            s.query(CheckIn).filter(CheckIn.user_id == phone_user.id).update(
                {"user_id": user_id}, synchronize_session="fetch"
            )
            s.query(DailyScore).filter(DailyScore.user_id == phone_user.id).update(
                {"user_id": user_id}, synchronize_session="fetch"
            )
            s.query(MessageLog).filter(MessageLog.user_id == phone_user.id).update(
                {"user_id": user_id}, synchronize_session="fetch"
            )

            # Deactivate the orphan phone-only user
            phone_user.is_active = False
            phone_user.phone = None
            logger.info(
                "Merged user %d (phone=%s) into user %d (%s). "
                "Transferred goals, check-ins, scores, messages.",
                phone_user.id, phone, user_id, target.email,
            )

        # Set the phone on the target user
        target.phone = phone
        logger.info("Linked phone %s to user %d", phone, user_id)


def get_all_active_users() -> list[User]:
    """Get all active users."""
    with get_session() as s:
        return s.query(User).filter(User.is_active.is_(True)).all()


def get_first_user() -> Optional[User]:
    """Get the first active user (for single-user mode / backwards compat)."""
    with get_session() as s:
        return s.query(User).filter(User.is_active.is_(True)).first()


# ---------------------------------------------------------------------------
# P1: Profile / Admin / Tier helpers
# ---------------------------------------------------------------------------

VALID_TIERS = {"free", "premium", "lifetime"}


def get_user(user_id: int) -> Optional[User]:
    with get_session() as s:
        return s.query(User).filter(User.id == user_id).first()


def update_user_profile(
    user_id: int,
    nickname: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> Optional[User]:
    """Patch nickname and/or avatar_url. Pass None to leave unchanged. Pass empty string to clear."""
    with get_session() as s:
        u = s.query(User).filter(User.id == user_id).first()
        if not u:
            return None
        if nickname is not None:
            u.nickname = nickname.strip() or None
        if avatar_url is not None:
            u.avatar_url = avatar_url or None
        s.flush()
        return u


def set_user_tier(target_user_id: int, tier: str) -> Optional[User]:
    if tier not in VALID_TIERS:
        raise ValueError(f"Invalid tier: {tier!r}. Must be one of {VALID_TIERS}.")
    with get_session() as s:
        u = s.query(User).filter(User.id == target_user_id).first()
        if not u:
            return None
        u.tier = tier
        u.tier_updated_at = datetime.now(timezone.utc)
        s.flush()
        return u


def set_user_admin(target_user_id: int, is_admin: bool) -> Optional[User]:
    with get_session() as s:
        u = s.query(User).filter(User.id == target_user_id).first()
        if not u:
            return None
        u.is_admin = bool(is_admin)
        s.flush()
        return u


def touch_last_active(user_id: int) -> None:
    """Cheap heartbeat — single UPDATE on each authed request."""
    with get_session() as s:
        s.query(User).filter(User.id == user_id).update(
            {User.last_active_at: datetime.now(timezone.utc)},
            synchronize_session=False,
        )


def list_users_with_stats(
    search: Optional[str] = None,
    tier: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Admin-only listing. Returns (rows, total_count).

    Pulls users + aggregate counts in a small fixed number of queries (no N+1):
      1) users query (paginated, with filters)
      2) bulk checkin counts grouped by user_id (for THIS page only)
      3) bulk daily_score aggregates grouped by user_id (current streak, total days)
    """
    with get_session() as s:
        q = s.query(User)
        if search:
            like = f"%{search.lower()}%"
            q = q.filter(
                func.lower(User.email).like(like)
                | func.lower(User.name).like(like)
                | func.lower(func.coalesce(User.nickname, "")).like(like)
                | func.coalesce(User.phone, "").like(like)
            )
        if tier:
            q = q.filter(User.tier == tier)

        total = q.count()
        users = (
            q.order_by(desc(User.created_at))
            .limit(max(1, min(limit, 200)))
            .offset(max(0, offset))
            .all()
        )

        user_ids = [u.id for u in users]
        if not user_ids:
            return [], total

        # Aggregate: checkin reply counts per user
        checkin_counts = dict(
            s.query(CheckIn.user_id, func.count(CheckIn.id))
            .filter(CheckIn.user_id.in_(user_ids), CheckIn.user_reply.isnot(None))
            .group_by(CheckIn.user_id)
            .all()
        )

        # Aggregate: total tracked days + max streak per user
        score_aggs = {
            uid: (days, max_streak, latest_date)
            for uid, days, max_streak, latest_date in (
                s.query(
                    DailyScore.user_id,
                    func.count(DailyScore.id),
                    func.max(DailyScore.streak_day),
                    func.max(DailyScore.date),
                )
                .filter(DailyScore.user_id.in_(user_ids))
                .group_by(DailyScore.user_id)
                .all()
            )
        }

        # Current streak = streak_day on the most recent tracked day (cheap join)
        latest_streak = {
            uid: streak
            for uid, streak in s.query(DailyScore.user_id, DailyScore.streak_day)
            .filter(
                DailyScore.user_id.in_(user_ids),
                DailyScore.date.in_(
                    s.query(func.max(DailyScore.date))
                    .filter(DailyScore.user_id.in_(user_ids))
                    .group_by(DailyScore.user_id)
                ),
            )
            .all()
        }

        rows = []
        for u in users:
            days, best_streak, _ = score_aggs.get(u.id, (0, 0, None))
            rows.append({
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "nickname": u.nickname,
                "avatar_url": u.avatar_url,
                "phone": u.phone,
                "is_admin": bool(u.is_admin),
                "is_active": bool(u.is_active),
                "tier": u.tier or "free",
                "tier_updated_at": u.tier_updated_at.isoformat() if u.tier_updated_at else None,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_active_at": u.last_active_at.isoformat() if u.last_active_at else None,
                "total_days": int(days or 0),
                "best_streak": int(best_streak or 0),
                "current_streak": int(latest_streak.get(u.id, 0)),
                "reply_count": int(checkin_counts.get(u.id, 0)),
            })
        return rows, total


def get_user_by_stripe_customer(customer_id: str) -> Optional[User]:
    with get_session() as s:
        return s.query(User).filter(User.stripe_customer_id == customer_id).first()


# Stripe -> internal tier mapping. trialing & active both unlock premium;
# past_due keeps premium (Stripe smart-retries handle it) but the UI shows a
# warning banner. anything else means revoke.
PAID_STATUSES = {"trialing", "active", "past_due"}


def apply_stripe_subscription(
    user_id: int,
    *,
    stripe_customer_id: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None,
    subscription_status: Optional[str] = None,
    trial_ends_at: Optional[datetime] = None,
    current_period_end: Optional[datetime] = None,
) -> Optional[User]:
    """Cache Stripe subscription state on a user and flip their tier.

    Only writes fields that are passed (None = leave alone). If a
    subscription_status is provided, the tier is updated accordingly:
      trialing | active | past_due -> premium
      anything else                 -> free
    Lifetime users are never downgraded by webhook events.
    """
    with get_session() as s:
        u = s.query(User).filter(User.id == user_id).first()
        if not u:
            return None
        if stripe_customer_id is not None:
            u.stripe_customer_id = stripe_customer_id
        if stripe_subscription_id is not None:
            u.stripe_subscription_id = stripe_subscription_id
        if trial_ends_at is not None:
            u.trial_ends_at = trial_ends_at
        if current_period_end is not None:
            u.current_period_end = current_period_end
        if subscription_status is not None:
            u.subscription_status = subscription_status
            if u.tier != "lifetime":
                new_tier = "premium" if subscription_status in PAID_STATUSES else "free"
                if u.tier != new_tier:
                    u.tier = new_tier
                    u.tier_updated_at = datetime.now(timezone.utc)
        s.flush()
        return u


def record_stripe_event(event_id: str, event_type: Optional[str] = None) -> bool:
    """Insert an event_id into the dedup table.

    Returns True if the event is new (should be processed), False if it was
    already recorded (duplicate Stripe retry).
    """
    with get_session() as s:
        existing = s.query(StripeEvent).filter(StripeEvent.event_id == event_id).first()
        if existing:
            return False
        s.add(StripeEvent(event_id=event_id, event_type=event_type))
        return True


def record_api_usage(
    user_id: Optional[int],
    model: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
) -> None:
    """Append one row to the api_usage ledger. Swallows DB errors with a
    log line — we never want a usage-tracking failure to break a live
    Claude reply to the user."""
    try:
        with get_session() as s:
            s.add(
                ApiUsage(
                    user_id=user_id,
                    model=model or "unknown",
                    input_tokens=int(input_tokens or 0),
                    output_tokens=int(output_tokens or 0),
                    cost_usd=float(cost_usd or 0.0),
                )
            )
    except Exception:
        logger.exception("Failed to record API usage (non-fatal)")


def get_usage_summary(days: int = 30) -> dict:
    """Aggregated Anthropic spend for the admin dashboard.

    Returns:
      - window_days: int — the period requested
      - total_usd: float — cost over the window
      - total_input_tokens, total_output_tokens: int
      - total_calls: int
      - by_day: list[{date, cost_usd, calls}] — for the trend sparkline
      - by_model: list[{model, cost_usd, calls}]
      - top_users: list[{user_id, name, email, cost_usd, calls}] (top 5)
      - projected_month_usd: float — naive linear projection from the
        current calendar month's actual spend.
    """
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=days)

    with get_session() as s:
        # Window totals
        window_q = s.query(ApiUsage).filter(ApiUsage.created_at >= window_start)
        total_cost = float(window_q.with_entities(func.coalesce(func.sum(ApiUsage.cost_usd), 0.0)).scalar() or 0)
        total_in = int(window_q.with_entities(func.coalesce(func.sum(ApiUsage.input_tokens), 0)).scalar() or 0)
        total_out = int(window_q.with_entities(func.coalesce(func.sum(ApiUsage.output_tokens), 0)).scalar() or 0)
        total_calls = int(window_q.with_entities(func.count(ApiUsage.id)).scalar() or 0)

        # Per-day breakdown — DATE() works for both SQLite and Postgres.
        by_day_rows = (
            s.query(
                func.date(ApiUsage.created_at).label("d"),
                func.sum(ApiUsage.cost_usd).label("cost"),
                func.count(ApiUsage.id).label("calls"),
            )
            .filter(ApiUsage.created_at >= window_start)
            .group_by(func.date(ApiUsage.created_at))
            .order_by(func.date(ApiUsage.created_at))
            .all()
        )
        by_day = [
            {"date": str(r.d), "cost_usd": round(float(r.cost or 0), 4), "calls": int(r.calls or 0)}
            for r in by_day_rows
        ]

        # Per-model breakdown
        by_model_rows = (
            s.query(
                ApiUsage.model,
                func.sum(ApiUsage.cost_usd).label("cost"),
                func.count(ApiUsage.id).label("calls"),
            )
            .filter(ApiUsage.created_at >= window_start)
            .group_by(ApiUsage.model)
            .order_by(desc("cost"))
            .all()
        )
        by_model = [
            {"model": r.model, "cost_usd": round(float(r.cost or 0), 4), "calls": int(r.calls or 0)}
            for r in by_model_rows
        ]

        # Top users by cost — join to User so the dashboard has labels.
        top_user_rows = (
            s.query(
                ApiUsage.user_id,
                func.sum(ApiUsage.cost_usd).label("cost"),
                func.count(ApiUsage.id).label("calls"),
            )
            .filter(ApiUsage.created_at >= window_start)
            .filter(ApiUsage.user_id.isnot(None))
            .group_by(ApiUsage.user_id)
            .order_by(desc("cost"))
            .limit(5)
            .all()
        )
        # Hydrate user metadata in one query
        user_ids = [r.user_id for r in top_user_rows]
        users_by_id = {}
        if user_ids:
            for u in s.query(User).filter(User.id.in_(user_ids)).all():
                users_by_id[u.id] = u
        top_users = []
        for r in top_user_rows:
            u = users_by_id.get(r.user_id)
            top_users.append({
                "user_id": int(r.user_id) if r.user_id else None,
                "name": (u.nickname or u.name) if u else "—",
                "email": u.email if u else None,
                "cost_usd": round(float(r.cost or 0), 4),
                "calls": int(r.calls or 0),
            })

        # Naive projection — actual MTD spend × (days_in_month / days_elapsed).
        # We project from this calendar month rather than the window so the
        # number means "expected bill at month-end", which is what a founder
        # actually wants to see.
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        mtd_cost = float(
            s.query(func.coalesce(func.sum(ApiUsage.cost_usd), 0.0))
            .filter(ApiUsage.created_at >= month_start)
            .scalar()
            or 0
        )
        days_elapsed = max(1, (now - month_start).days + (1 if now.day else 0))
        # Last day of the current month
        if month_start.month == 12:
            next_month = month_start.replace(year=month_start.year + 1, month=1)
        else:
            next_month = month_start.replace(month=month_start.month + 1)
        days_in_month = (next_month - month_start).days
        projected_month = mtd_cost * (days_in_month / days_elapsed) if days_elapsed > 0 else 0.0

    return {
        "window_days": days,
        "total_usd": round(total_cost, 4),
        "total_input_tokens": total_in,
        "total_output_tokens": total_out,
        "total_calls": total_calls,
        "by_day": by_day,
        "by_model": by_model,
        "top_users": top_users,
        "mtd_usd": round(mtd_cost, 4),
        "projected_month_usd": round(projected_month, 4),
    }


def admin_summary_stats() -> dict:
    """High-level numbers for the admin dashboard top cards."""
    with get_session() as s:
        total_users = s.query(func.count(User.id)).scalar() or 0
        by_tier = dict(
            s.query(User.tier, func.count(User.id))
            .group_by(User.tier)
            .all()
        )
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        active_7d = (
            s.query(func.count(User.id))
            .filter(User.last_active_at >= seven_days_ago)
            .scalar()
            or 0
        )
        new_7d = (
            s.query(func.count(User.id))
            .filter(User.created_at >= seven_days_ago)
            .scalar()
            or 0
        )
        admins = (
            s.query(func.count(User.id))
            .filter(User.is_admin.is_(True))
            .scalar()
            or 0
        )
        return {
            "total_users": int(total_users),
            "by_tier": {k or "free": int(v) for k, v in by_tier.items()},
            "active_7d": int(active_7d),
            "new_7d": int(new_7d),
            "admins": int(admins),
        }
