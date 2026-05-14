"""Database models and helper functions — SQLAlchemy with SQLite."""

import logging
from contextlib import contextmanager
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    desc,
    func,
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

    goals = relationship("Goal", back_populates="user")
    check_ins = relationship("CheckIn", back_populates="user")
    daily_scores = relationship("DailyScore", back_populates="user")
    messages = relationship("MessageLog", back_populates="user")


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


# ---------------------------------------------------------------------------
# Engine & session
# ---------------------------------------------------------------------------

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(engine)
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


def link_phone_to_user(user_id: int, phone: str):
    """Associate a phone number with an existing user account."""
    with get_session() as s:
        user = s.query(User).filter(User.id == user_id).first()
        if user:
            user.phone = phone
            logger.info("Linked phone %s to user %d", phone, user_id)


def get_all_active_users() -> list[User]:
    """Get all active users."""
    with get_session() as s:
        return s.query(User).filter(User.is_active.is_(True)).all()


def get_first_user() -> Optional[User]:
    """Get the first active user (for single-user mode / backwards compat)."""
    with get_session() as s:
        return s.query(User).filter(User.is_active.is_(True)).first()
