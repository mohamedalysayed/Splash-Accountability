"""Stripe billing — Payment Link URL building + Customer Portal + webhook handling.

Architecture:
  - We use a Stripe-hosted Payment Link (no PCI scope on our side).
  - Backend appends ?client_reference_id=<user.id>&prefilled_email=<email>
    to the link so the webhook can attribute the subscription back to a
    Splash account.
  - Stripe is the source of truth. We cache subscription_status / period_end
    on the User row so the dashboard can render without hitting the API.
  - Webhook events are deduped via stripe_events table (Stripe retries for
    up to 3 days; same event_id can hit us multiple times).
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote, urlencode, urlparse, urlunparse, parse_qsl

import stripe

from config import settings
from db import (
    User,
    apply_stripe_subscription,
    get_user,
    get_user_by_stripe_customer,
    record_stripe_event,
)

logger = logging.getLogger(__name__)


def configured() -> bool:
    """Are the required Stripe secrets present?"""
    return bool(settings.STRIPE_SECRET_KEY)


def _init_stripe() -> None:
    if settings.STRIPE_SECRET_KEY and stripe.api_key != settings.STRIPE_SECRET_KEY:
        stripe.api_key = settings.STRIPE_SECRET_KEY


def build_subscribe_url(user: User) -> str:
    """Return the Stripe Payment Link with user attribution params appended.

    Uses `client_reference_id` so checkout.session.completed carries the
    Splash user.id back to us, and `prefilled_email` so the user doesn't
    have to re-type their email.
    """
    base = settings.STRIPE_PAYMENT_LINK
    if not base:
        raise RuntimeError("STRIPE_PAYMENT_LINK is not configured")

    parsed = urlparse(base)
    existing = dict(parse_qsl(parsed.query))
    existing["client_reference_id"] = str(user.id)
    if user.email:
        existing["prefilled_email"] = user.email
    new_query = urlencode(existing, quote_via=quote)
    return urlunparse(parsed._replace(query=new_query))


def create_portal_session(user: User, return_url: Optional[str] = None) -> str:
    """Create a Stripe Customer Portal session and return its URL.

    Raises RuntimeError if the user has no Stripe customer (i.e. has never
    subscribed). Caller should redirect or return the URL to the client.
    """
    if not user.stripe_customer_id:
        raise RuntimeError("User has no Stripe customer — they haven't subscribed yet")
    _init_stripe()
    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=return_url or f"{settings.DASHBOARD_URL.rstrip('/')}/profile",
    )
    return session.url


def _ts_to_dt(ts: Optional[int]) -> Optional[datetime]:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _resolve_user_from_subscription(sub: dict) -> Optional[User]:
    """A subscription object has `customer` (id) and `metadata`. We look up
    by stripe_customer_id, falling back to a metadata.user_id if present."""
    customer_id = sub.get("customer")
    if customer_id:
        u = get_user_by_stripe_customer(customer_id)
        if u:
            return u
    md = sub.get("metadata") or {}
    if md.get("user_id"):
        try:
            return get_user(int(md["user_id"]))
        except (TypeError, ValueError):
            pass
    return None


def verify_and_parse_event(payload: bytes, signature: str) -> dict:
    """Validate the Stripe-Signature header and return the event as a plain dict.

    `stripe.Webhook.construct_event` returns a `stripe.Event` (a StripeObject
    subclass). Its attribute behavior changed across SDK versions — some
    11.x releases removed `.get()` from `StripeObject`, which made our handler
    chain blow up with a bare AttributeError("get"). We sidestep that by
    parsing the JSON payload ourselves *after* the signature is verified.

    Raises stripe.error.SignatureVerificationError or ValueError on bad
    payload — caller turns those into HTTP 400.
    """
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise RuntimeError("STRIPE_WEBHOOK_SECRET is not configured")
    # Verify signature (raises on mismatch). We discard the returned Event
    # object and re-parse the payload as a plain dict for safe .get() access.
    stripe.Webhook.construct_event(
        payload=payload,
        sig_header=signature,
        secret=settings.STRIPE_WEBHOOK_SECRET,
    )
    return json.loads(payload.decode("utf-8") if isinstance(payload, (bytes, bytearray)) else payload)


def handle_event(event: dict) -> str:
    """Route a parsed Stripe event. Returns a short status string for logging.

    Caller is responsible for idempotency (record_stripe_event) before
    invoking this. We handle:
      - checkout.session.completed       -> attribute subscription to user
      - customer.subscription.created    -> initial sync
      - customer.subscription.updated    -> status / period change
      - customer.subscription.deleted    -> cancel
      - invoice.payment_failed           -> log only (status flips via subscription.updated)
    Unknown events are acked silently.
    """
    etype = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}

    if etype == "checkout.session.completed":
        return _handle_checkout_completed(obj)
    if etype in ("customer.subscription.created", "customer.subscription.updated"):
        return _handle_subscription_change(obj)
    if etype == "customer.subscription.deleted":
        return _handle_subscription_deleted(obj)
    if etype == "invoice.payment_failed":
        cust = obj.get("customer")
        logger.warning("Stripe payment failed for customer=%s invoice=%s", cust, obj.get("id"))
        return "logged_payment_failed"

    return f"ignored:{etype}"


def _handle_checkout_completed(session: dict) -> str:
    """Fires once when the user finishes Stripe Checkout.

    Carries `client_reference_id` (our user.id), `customer` (Stripe id), and
    `subscription` (Stripe id). We attribute the customer + subscription back
    to the user here — and we *also* immediately fetch the subscription from
    Stripe so we can set status/trial_ends_at/current_period_end in a single
    event. Don't rely on the customer.subscription.created event following:
    if that one fails (network, bug, retry exhaustion), the user gets charged
    but never sees their trial. Belt + suspenders.
    """
    if session.get("mode") and session["mode"] != "subscription":
        return "ignored:non_subscription_checkout"

    ref = session.get("client_reference_id")
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    if not ref:
        logger.warning("checkout.session.completed without client_reference_id: %s", session.get("id"))
        return "missing_client_reference_id"
    try:
        user_id = int(ref)
    except (TypeError, ValueError):
        logger.warning("checkout.session.completed bad client_reference_id=%r", ref)
        return "bad_client_reference_id"

    user = get_user(user_id)
    if not user:
        logger.warning("checkout.session.completed for unknown user_id=%s", user_id)
        return "unknown_user"

    # 1) Link customer + subscription IDs (don't overwrite an existing
    #    linkage — almost certainly a duplicate checkout if mismatched).
    apply_kwargs: dict = {}
    if customer_id and not user.stripe_customer_id:
        apply_kwargs["stripe_customer_id"] = customer_id
    if subscription_id and not user.stripe_subscription_id:
        apply_kwargs["stripe_subscription_id"] = subscription_id
    if apply_kwargs:
        apply_stripe_subscription(user.id, **apply_kwargs)

    # 2) Best-effort: pull the full subscription right now so status / trial
    #    dates land in one event. Failures here are logged but don't fail
    #    the webhook — subscription.created (if it lands) will still cover us.
    if subscription_id:
        try:
            _init_stripe()
            sub = stripe.Subscription.retrieve(subscription_id)
            sub_dict = sub.to_dict() if hasattr(sub, "to_dict") else dict(sub)
            apply_stripe_subscription(
                user.id,
                stripe_customer_id=sub_dict.get("customer"),
                stripe_subscription_id=sub_dict.get("id"),
                subscription_status=sub_dict.get("status"),
                trial_ends_at=_ts_to_dt(sub_dict.get("trial_end")),
                current_period_end=_ts_to_dt(sub_dict.get("current_period_end")),
            )
            logger.info(
                "checkout.session.completed: user_id=%s customer=%s "
                "subscription=%s status=%s synced from Stripe",
                user.id, customer_id, subscription_id, sub_dict.get("status"),
            )
            return f"linked+synced:{sub_dict.get('status')}"
        except Exception:
            logger.exception(
                "Failed to fetch subscription %s during checkout.session.completed "
                "for user_id=%s — relying on customer.subscription.created event",
                subscription_id, user.id,
            )

    logger.info(
        "checkout.session.completed: user_id=%s customer=%s subscription=%s",
        user.id, customer_id, subscription_id,
    )
    return "linked"


def _handle_subscription_change(sub: dict) -> str:
    user = _resolve_user_from_subscription(sub)
    if not user:
        logger.warning("subscription change for unknown customer=%s", sub.get("customer"))
        return "unknown_user"
    apply_stripe_subscription(
        user.id,
        stripe_customer_id=sub.get("customer"),
        stripe_subscription_id=sub.get("id"),
        subscription_status=sub.get("status"),
        trial_ends_at=_ts_to_dt(sub.get("trial_end")),
        current_period_end=_ts_to_dt(sub.get("current_period_end")),
    )
    logger.info(
        "subscription %s: user_id=%s status=%s",
        sub.get("id"), user.id, sub.get("status"),
    )
    return f"synced:{sub.get('status')}"


def _handle_subscription_deleted(sub: dict) -> str:
    user = _resolve_user_from_subscription(sub)
    if not user:
        return "unknown_user"
    apply_stripe_subscription(
        user.id,
        subscription_status="canceled",
    )
    logger.info("subscription %s canceled for user_id=%s", sub.get("id"), user.id)
    return "canceled"


def sync_user_subscription(user: User) -> str:
    """Pull the user's current subscription state from Stripe and apply it.

    Backstop for missed/failed webhook events: if a user's tier doesn't
    match what Stripe says, this re-syncs without waiting for a webhook.
    Strategy:
      1) If user.stripe_subscription_id is set, retrieve it directly.
      2) Else if user.stripe_customer_id is set, list active+trialing subs
         for that customer and pick the most recent.
      3) Else, look up the customer by email and try again.

    Returns a short status string (e.g. "synced:trialing", "no_customer",
    "no_subscription").
    """
    _init_stripe()

    sub_dict: Optional[dict] = None

    if user.stripe_subscription_id:
        try:
            sub = stripe.Subscription.retrieve(user.stripe_subscription_id)
            sub_dict = sub.to_dict() if hasattr(sub, "to_dict") else dict(sub)
        except Exception:
            logger.warning(
                "sync: stored subscription_id %s no longer valid for user_id=%s",
                user.stripe_subscription_id, user.id,
            )

    if not sub_dict and user.stripe_customer_id:
        try:
            # `status='all'` so we also catch past_due / paused. We pick the
            # newest one — Stripe usually returns at most one per customer
            # for a single product.
            subs = stripe.Subscription.list(
                customer=user.stripe_customer_id, status="all", limit=10
            )
            items = list(subs.auto_paging_iter()) if hasattr(subs, "auto_paging_iter") else (subs.get("data") or [])
            if items:
                # Prefer trialing/active, else most recent by created.
                items_sorted = sorted(
                    items,
                    key=lambda s: (
                        0 if (s.get("status") if isinstance(s, dict) else s["status"]) in ("trialing", "active") else 1,
                        -((s.get("created") if isinstance(s, dict) else s["created"]) or 0),
                    ),
                )
                top = items_sorted[0]
                sub_dict = top.to_dict() if hasattr(top, "to_dict") else dict(top)
        except Exception:
            logger.exception("sync: failed to list subscriptions for customer=%s", user.stripe_customer_id)

    if not sub_dict and user.email:
        # Last resort: maybe the customer exists in Stripe but isn't linked
        # to this user yet (webhook never landed). Look up by email.
        try:
            customers = stripe.Customer.list(email=user.email, limit=5)
            citems = list(customers.auto_paging_iter()) if hasattr(customers, "auto_paging_iter") else (customers.get("data") or [])
            for c in citems:
                cid = c.get("id") if isinstance(c, dict) else c["id"]
                subs = stripe.Subscription.list(customer=cid, status="all", limit=5)
                sitems = list(subs.auto_paging_iter()) if hasattr(subs, "auto_paging_iter") else (subs.get("data") or [])
                if sitems:
                    top = sitems[0]
                    sub_dict = top.to_dict() if hasattr(top, "to_dict") else dict(top)
                    break
        except Exception:
            logger.exception("sync: email-based fallback failed for user_id=%s", user.id)

    if not sub_dict:
        if not user.stripe_customer_id:
            return "no_customer"
        return "no_subscription"

    apply_stripe_subscription(
        user.id,
        stripe_customer_id=sub_dict.get("customer"),
        stripe_subscription_id=sub_dict.get("id"),
        subscription_status=sub_dict.get("status"),
        trial_ends_at=_ts_to_dt(sub_dict.get("trial_end")),
        current_period_end=_ts_to_dt(sub_dict.get("current_period_end")),
    )
    logger.info(
        "sync: user_id=%s subscription=%s status=%s",
        user.id, sub_dict.get("id"), sub_dict.get("status"),
    )
    return f"synced:{sub_dict.get('status')}"


def process_event(payload: bytes, signature: str) -> tuple[bool, str]:
    """End-to-end: verify signature, dedup, route. Returns (processed, status)."""
    event = verify_and_parse_event(payload, signature)
    event_id = event.get("id") or ""
    if not record_stripe_event(event_id, event.get("type")):
        return True, "duplicate"
    status = handle_event(event)
    return True, status
