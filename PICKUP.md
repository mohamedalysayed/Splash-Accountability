# Pickup Guide — Where You Left Off (May 16, 2026 — late evening)

## 🚀 Production is FULLY LIVE

| Component | Status | URL / Note |
|---|---|---|
| Backend API (Fly.io, `iad`) | ✅ LIVE | https://splash-accountability-api.fly.dev |
| `/health` | ✅ 200 OK | https://splash-accountability-api.fly.dev/health |
| Dashboard (Netlify) | ✅ LIVE | https://splash-accountability.netlify.app |
| CORS lockdown | ✅ | Netlify domain + preview regex + localhost:3000 |
| Twilio webhook → Fly | ✅ | Repointed; proved E2E (inbound msg → Claude reply → outbound, ~2s) |
| Stripe billing | ✅ | Trial → premium flip proved E2E on `splashcfd@gmail.com` |
| Admin authz | ✅ | `ADMIN_EMAILS=muhammmedaly@gmail.com,splashcfd@gmail.com` |
| Founder accounts | ✅ | `muhammmedaly` = lifetime, `splashcfd` = trial (active) |
| CI/CD | ✅ | All 3 workflows green; Fly Deploy on push works |
| Sentry | 🟡 Wired, dormant | Code in place; activates when `SENTRY_DSN` Fly secret is set |

---

## ✅ Shipped this session

### Production launch hardening
- **Stripe E2E verified** — created trial on `splashcfd`, webhook fired, customer linked by email, tier flipped to `premium`. Cancel/free transitions also proven via the founder account.
- **Twilio webhook repointed** to `https://splash-accountability-api.fly.dev/webhook`. Tested with real WhatsApp message — 2s round-trip.
- **Admin restored** for `muhammmedaly@gmail.com` (ADMIN_EMAILS Fly secret) and promoted to `lifetime` tier (webhook-immune).
- **Landing-page flash fixed** (`dashboard/lib/auth.tsx`) — protected routes suppress render until auth resolves; public routes render immediately.
- **Sentry SDK wired** (`webhook.py`) — no-op when `SENTRY_DSN` is empty, zero risk to leave in. Set the secret when you're ready.
- **CI green across the board** — fixed Next 16's `next lint` removal (`eslint .`); lint is advisory, type-check + build still gate.

### Onboarding & DX
- **`setup.sh`** — fresh-clone bootstrap for project deps (venv, npm, DB init, JWT auto-gen).
- **`bootstrap.sh`** — fresh-machine bootstrap for system deps (python3, node, flyctl, gh, ngrok). Linux + macOS.
- **`ONBOARDING.md`** — new-machine playbook + disaster-recovery table (rebuild `.env` from source-of-truth consoles).
- **Encrypted secrets bundle** at `~/Splash-Accountability-secrets-20260516-212218.zip.gpg` (password: `splash2026`). Decrypt with `gpg -o secrets.zip -d <file>.gpg`.

### Already done last session (still true)
- A1: Anthropic token-usage tracking + admin spend widget (`api_usage` table, `/api/admin/usage`, dashboard tile).

---

## 🛬 What's left before/around first real customer

### Pre-launch (do these soon)

| Task | Effort | Why |
|---|---|---|
| **Send sandbox join code to first user** | 1 min | Highest-leverage thing right now |
| Set `SENTRY_DSN` Fly secret | 5 min | Error visibility before first user hits a bug |
| Set `TWILIO_SANDBOX_JOIN_CODE=ask-simplest` Fly secret | 1 min | Onboarding card already reads `/api/config` |
| Destroy obsolete `splash-accountability` Fly app | 30s | `flyctl apps destroy splash-accountability` |

### Post-first-customer (do these before user #5)

| Risk | Fix | Effort |
|---|---|---|
| SQLite on single Fly volume = data-loss risk, no replicas | Migrate to **Neon Postgres** + alembic | 1–2 hr |
| Voice notes on Fly volume = bloat, paid egress | Move to **Cloudflare R2** (zero egress) | 1 hr |
| Twilio sandbox 72h expiry, "join ask-simplest" friction | Apply for production **WhatsApp Business** number | external — days |
| ~200 dashboard lint errors (Next 16's stricter eslint-config) | Mechanical cleanup: `any` → types, refactor effects | 1–2 hr |

---

## 🗺️ Architecture

```
┌──────────────────── BROWSER ────────────────────┐
│   Next.js dashboard @ splash-accountability     │
│   .netlify.app    (CDN, Netlify Next runtime)   │
│                  │  NEXT_PUBLIC_API_URL          │
│                  ▼                               │
│   https://splash-accountability-api.fly.dev     │
│   ┌──────────────────────────────────────────┐  │
│   │  FastAPI (uvicorn) — Fly.io iad          │  │
│   │  ├─ /webhook          (Twilio inbound)   │  │
│   │  ├─ /api/*            (REST for dash)    │  │
│   │  ├─ /api/stripe/*     (Payment + portal) │  │
│   │  ├─ /api/admin/*      (env-gated)        │  │
│   │  ├─ /health           (Fly probes)       │  │
│   │  └─ APScheduler — multi-user check-ins   │  │
│   │  Volume: /app/data → SQLite (1GB)        │  │
│   └──────────────────────────────────────────┘  │
│           │           │           │              │
│           ▼           ▼           ▼              │
│       Twilio      Anthropic     Stripe           │
│      (WhatsApp)  (Haiku 4.5)  (subscriptions)    │
└──────────────────────────────────────────────────┘
```

---

## What's Working

| Feature | Status |
|---|---|
| Agent scheduler (multi-user, Europe/Zurich) | ✅ |
| WhatsApp in/out (sandbox) | ✅ prod-verified |
| Smart conversation routing (AI classification) | ✅ |
| Voice notes (transcription) | ✅ |
| Recurring reminders (gym, social) | ✅ |
| Dashboard (glassmorphic) | ✅ Netlify |
| Auth (JWT + Google OAuth) | ✅ |
| Phone linking (settings) | ✅ |
| Stripe billing (Payment Link + portal + webhook) | ✅ prod-verified |
| Admin space (env-gated) | ✅ |
| Anthropic usage tracking | ✅ |
| Sentry error tracking | 🟡 wired, awaiting DSN |

## Your Credentials & Test Accounts

- **Owner email**: `splashcfd@gmail.com` (lifetime founder #2, currently in trial test mode)
- **Founder email**: `muhammmedaly@gmail.com` (user #1, lifetime — webhook-immune)
- **WhatsApp**: `+41766977284` (linked to muhammmedaly)
- **Twilio sandbox**: `+14155238886` ("join ask-simplest", expires every 72h)
- **AI model**: Claude Haiku 4.5

## How to Start Everything Locally

```bash
./start.sh                    # API:8080, dashboard:3000, ngrok, scheduler
```

Or on a fresh machine:
```bash
./bootstrap.sh                # system deps (one-time per machine)
./setup.sh                    # project deps (idempotent)
./start.sh
```

## Project Structure

```
Splash-Accountability/
  agent.py          — APScheduler, multi-user check-ins, recurring reminders
  webhook.py        — FastAPI: webhook + REST + auth + Stripe + admin + /health + Sentry
  ai.py             — Claude: generation, parsing, classification, usage tracking
  auth.py           — JWT + password hashing + Google OAuth verify
  billing.py        — Stripe payment links, portal, webhook handlers
  config.py         — Settings (CORS, RECURRING_REMINDERS, Stripe, admin)
  db.py             — SQLAlchemy models + helpers + api_usage table
  whatsapp.py       — Twilio send + console fallback + rate limiting
  bootstrap.sh      — Fresh-MACHINE setup (system deps)
  setup.sh          — Fresh-CLONE setup (project deps, idempotent)
  start.sh          — Local orchestration
  Dockerfile        — Fly container
  fly.toml          — Fly app (splash-accountability-api)
  DEPLOY.md         — Production deploy playbook
  ONBOARDING.md     — New-machine playbook + disaster-recovery
  LESSONS.md        — Gotchas from the build
  .github/workflows/
    fly-deploy.yml      — Auto-deploy API on push to main
    dashboard-ci.yml    — tsc + build (lint advisory)
    api-ci.yml          — Compile + import smoke
  data/             — SQLite + logs (LOCAL only; prod DB is on Fly volume)
  dashboard/        — Next.js 16 frontend (glassmorphic)
    app/            — pages (page, weekly, goals, trends, login, register, landing, admin, profile)
    lib/            — api.ts, auth.tsx
    netlify.toml    — Netlify build config
```

## Key Architecture Decisions

- **SQLite, single Fly machine, single volume** — `min_machines_running=1`. No horizontal scale until Postgres.
- **Stripe tier mapping** — `trialing|active|past_due` → premium; everything else → free. `lifetime` is webhook-immune.
- **Admin authz** — env-driven via `ADMIN_EMAILS` Fly secret; auto-syncs on `/api/auth/me` via `_sync_admin_from_env()`. No DB seed needed.
- **CORS** — env-driven (`CORS_ORIGINS` + `CORS_ORIGIN_REGEX`); locked to Netlify + preview + localhost.
- **Auth redirect** — handled exclusively in `dashboard/lib/auth.tsx` (`AuthProvider`); render gate prevents flash.
- **CI** — dashboard & API workflows are path-scoped so frontend changes don't redeploy API.

## Known Issues / Notes

- Twilio sandbox expires every 72h ("join ask-simplest" to rejoin).
- Backend single-machine on Fly — no horizontal scale until Postgres migration.
- Dashboard lint surfaces ~200 errors from Next 16's stricter eslint config — cosmetic, advisory in CI, scheduled for cleanup.
- `sqlite3` CLI is NOT installed in the Fly container — use `flyctl ssh console -C "python -c ..."` for DB queries.

---

# IMMEDIATE NEXT TASK

**Send the WhatsApp sandbox join code (`join ask-simplest` to `+14155238886`) to one real person and onboard them.** Everything technical is in place. The remaining items are all post-first-customer concerns.

If you want one more 30-min hardening pass before doing that: set `SENTRY_DSN` so the first user's bugs are debuggable.

---

# ROADMAP — Post-launch backlog

## A. Anthropic API at scale

### A1. Token-usage tracking + admin spend widget — ✅ DONE
- `api_usage` table; `_call_with_retry` logs every successful response.
- `GET /api/admin/usage?days=N` → admin page shows spend widget + by-model + top-users.

### A2. Cheap wins (10x runway on the same key)
- **Switch classification to Haiku 4.5** in `ai.py` (already done for most; verify intent + structured parsing).
- **Prompt caching** — *gated on prefix size*: Haiku 4.5 needs ≥4096-token prefix to cache. Current `SYSTEM_PROMPT` is ~60 tokens; would silently no-op. Revisit if/when prompts grow.
- **Per-user daily token cap** in DB. Saves you from runaway-loop bugs.
- **Batch API for non-realtime tasks** (morning summary, weekly trend writeups) — 50% discount.

### A3. Graduation criteria — move off personal key when ANY of:
- Monthly spend ≥ $100
- Hitting Tier 1 rate limits
- LLC formed / clean accounting needed
- Action: dedicated Anthropic org → swap `ANTHROPIC_API_KEY` Fly secret. No code change.

## B. Landing-page motion (brainstorm — pick later)

**Recommended combo for max wow / min effort:** 1 + 3 + 9 (~2 hours, zero deps).

### Tier 1 — drop in
1. **Aurora bleed** — extend `.mesh-bg` with 3rd blob + higher opacity on `/landing`.
2. **Scroll-tied parallax** — hero copy + screenshot offset by scrollY × 0.3-0.6.
3. **Cursor-reactive spotlight** — radial-gradient following mouse on hero.
4. **Counter "tick" on scroll into view** — animated count-up via `IntersectionObserver` + RAF.

### Tier 2 — half a day each
5. Floating ghost goal cards behind hero
6. Self-typing WhatsApp bubbles (fake demo loop)
7. Streak flame pulse (SVG + drop-shadow cycle)

### Tier 3 — weekend project
8. Canvas particle field (~80 LOC vanilla canvas)
9. **Ice score orb as hero element** — reuse `IceScoreOrb`, blow up to 280px, animate 0→100%
10. WebGL gradient mesh (Stripe-style)

### Non-negotiables (free)
- `@media (prefers-reduced-motion: no-preference)` on all motion
- Mouse/scroll handlers throttled to `requestAnimationFrame`
- Pause infinite animations on `document.visibilitychange === "hidden"`
