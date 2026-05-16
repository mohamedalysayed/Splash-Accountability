# LESSONS — Splash Accountability

A field guide of hurdles hit while shipping Splash. When you spin up the next
SaaS-on-WhatsApp / Stripe / FastAPI / Next.js stack, **read this first**. Each
section is a self-contained "you will hit this — here is the fix".

---

## 1. Stripe webhooks: the SDK 11.x `.get()` trap

**Symptom.** Every Stripe webhook returns HTTP 400 with a one-word log line
`rejected: get`. Subscriptions never flip user tier.

**Cause.** `stripe.Webhook.construct_event(...)` returns a `stripe.Event`
backed by a `StripeObject`. In SDK 11.x, calling `.get("type")` or
`.get("data")` on that object throws `TypeError: get expected at least 1
argument, got 0` in some code paths, because `StripeObject` overrides `get` in
a way that confuses introspection helpers. The 400 was our handler swallowing
that exception with a `str(e)` that happened to read `"get"`.

**Fix.** Verify signature with the SDK, then parse JSON yourself:

```python
def verify_and_parse_event(payload: bytes, signature: str) -> dict:
    stripe.Webhook.construct_event(
        payload=payload, sig_header=signature,
        secret=settings.STRIPE_WEBHOOK_SECRET,
    )  # raises on bad sig — we discard the returned object
    return json.loads(payload.decode("utf-8"))
```

Now the handler reads plain dicts. No more StripeObject foot-gun.

**Bonus rule:** always log webhook errors with `exc_info=True` and
`type(e).__name__`. A cryptic `rejected: get` cost us hours; the traceback
would have shown the SDK frame immediately.

---

## 2. Stripe: never trust the webhook to land

`checkout.session.completed` fires reliably. `customer.subscription.created`
sometimes doesn't (network flake, replay, queue lag). If you only set the
tier in the subscription handler, paying users land on a stuck "Free" page
and assume the product is broken.

**Three-layer defense:**

1. **Signature verify** (as above).
2. **Eager fetch in checkout handler.** Inside `_handle_checkout_completed`,
   immediately hit `stripe.Subscription.retrieve(...)` and apply the tier
   right there — don't wait for the `subscription.*` event.
3. **User-facing sync endpoint.** Add `POST /api/billing/sync` that pulls
   subscription state from Stripe by `subscription_id`, then `customer_id`,
   then email as fallback. Expose it as a "Sync from Stripe" button on the
   plan card, visible whenever `has_stripe_customer && tier === "free"`.

Layer 2 catches missed `subscription.created` events automatically; layer 3
gives the user a self-recovery escape hatch if all webhooks fail.

---

## 3. Netlify: `publish` is relative to the **repo root**, not `base`

`netlify.toml`:

```toml
[build]
  base = "dashboard"
  publish = "dashboard/.next"   # NOT just ".next"
```

If you set `publish = ".next"` it builds, but `netlify deploy --prod` from
the `dashboard/` subdirectory errors with:

```
publish directory was not found at /<repo>/dashboard/dashboard/.next
```

`base` changes the build CWD; `publish` is always resolved from the repo
root. Always deploy from the repo root.

---

## 4. Admin authorization: env-driven, NOT UI-controlled

**Don't** let any admin click a checkbox in the dashboard and create new
admins. **Do** drive admin status from a `ADMIN_EMAILS` env secret, and
**re-sync on every `/api/auth/me` call**:

- Email in `ADMIN_EMAILS` → user.is_admin auto-promoted
- Email removed from `ADMIN_EMAILS` → user.is_admin auto-demoted

This guarantees:
- No self-lockout (rotate env to recover)
- Admin escalation requires Fly secret access, not a leaked JWT
- The admin UI toggle is informational + temporary; env is the source of truth

**Trap we hit.** Setting `ADMIN_EMAILS=email1,email2` while expecting only
`email1` is admin. Both got admin. There is no parsing rule — every email in
the comma list is admin. Triple-check before `fly secrets set`.

---

## 5. Fly.io: keep the webhook always-on

WhatsApp webhooks have a ~5s timeout. If your machine cold-starts on the
first message after auto-stop, Twilio times out, retries, you dedupe poorly,
users see double messages.

```toml
# fly.toml
[http_service]
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 1   # <— the magic line
```

`min_machines_running = 1` keeps one machine warm 24/7. Costs ~$2/mo on the
shared-cpu-1x preset. Worth every cent for a webhook-driven product.

---

## 6. Twilio Sandbox: tell the user the join phrase explicitly

The Twilio WhatsApp Sandbox requires a one-time DM of `join <two-words>` from
the user's number to `+14155238886` *before* any outbound message you send
will be delivered. If you forget to tell them this in onboarding, they:

1. Link their phone in your UI
2. Wait for the first check-in
3. Get nothing
4. Churn

**Do.** Add a public `GET /api/config` endpoint exposing
`whatsapp_number`, `sandbox_join_code`, and `is_sandbox`. Render the exact
phrase + a one-tap copy button in onboarding. Server-side config means you
can rotate the sandbox code without redeploying the frontend.

Production: when you move off the sandbox to an approved number, just unset
`TWILIO_SANDBOX_JOIN_CODE` and `is_sandbox` flips false — the onboarding
copy hides itself automatically.

---

## 7. Google OAuth: the three-tier upsert

For "Sign in with Google" that also handles existing email accounts cleanly:

```python
# 1. Match by google_id (existing Google user)
user = get_user_by_google_id(google_id)

# 2. Match by email (existing password user → link Google for next time)
if not user:
    existing = get_user_by_email(email)
    if existing:
        user = link_google_to_user(existing.id, google_id)

# 3. Brand new
if not user:
    user = create_user_with_google(google_id, email, name)
```

This means a user who signed up with email/password and later clicks "Sign
in with Google" gets the **same account**, not a duplicate. Always verify
`email_verified` claim on the ID token before trusting it.

**Frontend.** Use `@react-oauth/google` and pass the `credential` straight
to your backend. Wrap your app once in `<GoogleOAuthProvider>` near the
root of `ClientLayout.tsx`. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on Netlify
to the **same** OAuth Client ID you use server-side.

---

## 8. SQLite additive migrations

For a small app, skip Alembic. Use `PRAGMA table_info(<table>)` + `ALTER
TABLE ... ADD COLUMN ...` at boot:

```python
existing = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
for col, ddl in [("google_id", "TEXT"), ("nickname", "TEXT"), ...]:
    if col not in existing:
        conn.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
```

Safe, idempotent, runs on every boot. Add `CREATE UNIQUE INDEX IF NOT
EXISTS` for any new unique columns separately — `ALTER TABLE` can't add
constraints in SQLite.

---

## 9. Explicit save > silent auto-save in admin UIs

Two reviewers flagged the same thing: dropdowns that auto-PATCH on every
change feel "modern" but are dangerous in tables of 50+ rows. One mis-toggle
and someone's tier is wrong with no undo prompt. The fix is dull and worth
it:

1. Track per-row `pending: Record<id, Partial<Patch>>`
2. Diff against the row's current value when staging an edit (so reverting
   to the original clears the dirty flag)
3. Render a row-level `Save` button, disabled when not dirty
4. Add a `Cancel` action that drops pending edits for that row
5. Flash `✓ saved` for 2s after successful save

Cost: ~50 lines. Benefit: zero fat-finger incidents.

---

## 10. CORS: regex for previews, list for prod

```python
CORS_ORIGINS = "https://splash-accountability.netlify.app"
CORS_ORIGIN_REGEX = r"https://.*\.netlify\.app"
```

`CORS_ORIGINS` is the canonical prod origin. `CORS_ORIGIN_REGEX` matches
every Netlify preview deploy (`deploy-preview-12--app.netlify.app`). Without
the regex, every PR preview hits CORS errors.

---

## 11. Dashboard env on Netlify: prefix or it doesn't ship

Anything the browser needs **must** be `NEXT_PUBLIC_*`. We hit this with
the Google client ID — `GOOGLE_OAUTH_CLIENT_ID` on Netlify went unused
because the frontend reads `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Set both names
if your backend and frontend share Netlify, or set the right one for each.

---

## Quickstart checklist for the next project

- [ ] `min_machines_running = 1` in `fly.toml`
- [ ] Stripe webhook parses JSON after sig-verify (no `StripeObject.get`)
- [ ] Stripe checkout handler eagerly fetches subscription
- [ ] `/api/billing/sync` endpoint + UI button
- [ ] `ADMIN_EMAILS` env + `_sync_admin_from_env` on every `/me`
- [ ] `netlify.toml` `publish = "dashboard/.next"` (full path from repo root)
- [ ] Public `/api/config` for Twilio sandbox copy + onboarding renders it
- [ ] Google OAuth: three-tier upsert + `email_verified` check
- [ ] CORS regex for Netlify previews
- [ ] All browser-side env vars prefixed `NEXT_PUBLIC_`
- [ ] Webhook handlers log with `exc_info=True`
- [ ] Admin tables: explicit Save per row, no silent auto-save
