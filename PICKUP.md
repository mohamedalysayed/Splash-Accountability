# Pickup Guide — Where You Left Off (May 16, 2026 — evening)

## 🚀 Production is LIVE (partial)

| Component | Status | URL |
|---|---|---|
| Backend API (Fly.io, `iad`) | **LIVE** | https://splash-accountability-api.fly.dev |
| `/health` check | ✅ 200 OK | https://splash-accountability-api.fly.dev/health |
| Dashboard (Netlify) | **LIVE** | https://splash-accountability.netlify.app |
| CORS lockdown | ✅ Locked to Netlify domain + preview regex + localhost:3000 | — |
| Old Fly dashboard (`splash-accountability`) | Deployed v1 but obsolete | Destroy after Netlify is live |
| Twilio webhook URL | **NOT yet repointed at Fly** | Still pointing at local ngrok |

### What's already done (this session)

- Backend deployed to Fly with all 9 secrets in place.
- Added `/health` endpoint (webhook.py).
- Switched CORS from `*` to env-driven `CORS_ORIGINS` + `CORS_ORIGIN_REGEX` (config.py).
- Created `netlify.toml` (Node 20, Next plugin, security headers).
- Created `.github/workflows/dashboard-ci.yml` (lint + tsc + build).
- Created `.github/workflows/api-ci.yml` (compile + import smoke).
- Scoped existing `fly-deploy.yml` to ignore `dashboard/**` so frontend pushes don't redeploy API.
- Full deploy playbook in `DEPLOY.md`.
- **Dashboard deployed to Netlify** (`netlify deploy --prod`) — fixed `publish` path (must be `dashboard/.next`, not `.next`, when `base = "dashboard"`).
- **Netlify env** `NEXT_PUBLIC_API_URL=https://splash-accountability-api.fly.dev` (production context).
- **CORS locked** on Fly to `https://splash-accountability.netlify.app` + branch-preview regex + `http://localhost:3000` (for local dev).
- Verified end-to-end: all 8 routes 200, CORS preflight returns proper allow-origin for Netlify, denies arbitrary origins, API URL baked into JS chunks.

---

## 🛬 Remaining manual steps (only you can do these)

### 1. ~~Deploy dashboard to Netlify~~ ✅ DONE
Live at https://splash-accountability.netlify.app

### 2. ~~Lock CORS to the Netlify domain~~ ✅ DONE

### 3. Point Twilio at production
In Twilio console → WhatsApp sandbox → "When a message comes in":
```
https://splash-accountability-api.fly.dev/whatsapp/webhook
```

### 4. Wire CI auto-deploy
```bash
flyctl tokens create deploy -x 999999h
# Paste output into GitHub → Settings → Secrets → Actions → FLY_API_TOKEN
```

### 5. Destroy the obsolete Fly dashboard
```bash
flyctl apps destroy splash-accountability
```

---

## 🧱 Strongly recommended before launch (in priority order)

| Risk | Fix | Effort |
|---|---|---|
| SQLite on single Fly volume = data loss if disk dies, no replicas, painful migrations | Migrate to **Neon Postgres** (free tier) — flip `DATABASE_URL`, add alembic | 1–2 hr |
| Voice notes on Fly volume = bloat, paid egress | Move to **Cloudflare R2** (zero egress) | 1 hr |
| No error tracking | Add **Sentry** to API + Next.js (DSN env vars on both) | 30 min |
| Twilio sandbox = 72h expiry & "join ask-simplest" hassle | Apply for production **WhatsApp Business** number | external — days |
| `allow_origins=["*"]` *was* permissive, now config-driven but defaults to `*` | After step 2 above, you're locked down | done after step 2 |

---

## 🗺️ Architecture (current, end-of-session)

```
┌──────────────────── BROWSER ────────────────────┐
│                                                  │
│   Next.js dashboard @ <site>.netlify.app        │
│      (CDN-served, Netlify Next runtime)         │
│                  │  NEXT_PUBLIC_API_URL          │
│                  ▼                               │
│   https://splash-accountability-api.fly.dev     │
│   ┌──────────────────────────────────────────┐  │
│   │  FastAPI (uvicorn) — Fly.io iad          │  │
│   │  ├─ /webhook          (Twilio inbound)   │  │
│   │  ├─ /api/*            (REST for dash)    │  │
│   │  ├─ /health           (Fly probes)       │  │
│   │  └─ APScheduler — multi-user check-ins   │  │
│   │  Volume: /app/data → SQLite (1GB)        │  │
│   └──────────────────────────────────────────┘  │
│                  │              │                │
│                  ▼              ▼                │
│             Twilio          Anthropic            │
│           (WhatsApp)        (Claude Haiku)       │
└──────────────────────────────────────────────────┘
```

---

## What's Working (local + prod)

| Feature | Status | Notes |
|---|---|---|
| Agent scheduler | Working | Multi-user, 08:00/13:00/19:00 Europe/Zurich |
| WhatsApp outbound | Working | Twilio sandbox |
| WhatsApp inbound | Working **locally** | Prod requires step 3 above |
| Smart conversations | Working | AI intent classification |
| Voice notes | Working | Claude transcription |
| Recurring reminders | Working | Gym + social media in morning check-in |
| Dashboard | Working **locally**; Netlify pending | http://localhost:3000 → glassmorphic |
| API server | Working **locally and in prod** | Fly URL above |
| Auth (JWT) | Working | Register/login/protected |
| Phone linking | Working | Settings → links WhatsApp number |
| Database | SQLite | Single volume on Fly — see migration plan |

## Your Credentials

All secrets are in `.env` locally + Fly secrets in prod. Key values:
- **Dashboard login**: muhammmedaly@gmail.com (user id=2)
- **WhatsApp number**: +41766977284 (linked to dashboard account)
- **Twilio sandbox**: +14155238886 (rejoin every 72h with "join ask-simplest")
- **AI model**: Claude Haiku 4.5

## How to Start Everything Locally

```bash
cd /home/mohamed/Development/codes/Splash-Accountability
./start.sh
```

Launches: API (8080), dashboard (3000), ngrok tunnel, agent scheduler.

## Project Structure

```
Splash-Accountability/
  agent.py          — APScheduler, multi-user check-ins, recurring reminders
  webhook.py        — FastAPI: Twilio webhook + REST API + auth + AI intent routing + /health
  ai.py             — Claude: generation, parsing, freeform classification
  auth.py           — JWT + password hashing
  config.py         — Settings (incl. CORS_ORIGINS, CORS_ORIGIN_REGEX, RECURRING_REMINDERS)
  db.py             — SQLAlchemy models + helpers
  whatsapp.py       — Twilio send + console fallback + rate limiting
  start.sh          — Local orchestration
  Dockerfile        — Production container (Fly)
  fly.toml          — Fly app config (splash-accountability-api)
  DEPLOY.md         — Full production deploy playbook
  .github/workflows/
    fly-deploy.yml      — Auto-deploy API on push to main
    dashboard-ci.yml    — Lint/tsc/build dashboard on PR
    api-ci.yml          — Compile + import smoke on PR
  data/             — SQLite DB + logs (local)
  dashboard/        — Next.js 16 frontend (glassmorphic)
    app/            — pages (page.tsx, weekly/, goals/, trends/, login/, register/, landing/)
    lib/            — api.ts (API client), auth.tsx (AuthProvider)
    netlify.toml    — Netlify build config (Node 20, Next plugin, security headers)
    fly.toml        — Old Fly config (to be removed once Netlify live)
```

## Key Architecture Decisions

- **Single SQLite DB** shared by agent, webhook, API. No migration tool yet — `init_db()` with `create_all()`. **TODO before scale:** Neon Postgres + alembic.
- **CORS** is env-driven now — set `CORS_ORIGINS` / `CORS_ORIGIN_REGEX` on Fly to lock to your Netlify domain.
- **Auth redirect**: all auth redirects go through `AuthProvider` (dashboard/lib/auth.tsx). `fetchJSON` throws on 401 but does NOT redirect.
- **CI**: dashboard and API workflows are scoped to their respective paths so changes don't cross-trigger.
- **Console mode**: `MESSAGING_MODE=console` in `.env` prints messages instead of WhatsApp.

## Known Issues / Notes

- Twilio sandbox expires every 72h ("join ask-simplest" to rejoin).
- Backend is single-machine on Fly (`min_machines_running=1`) — no horizontal scaling yet because SQLite.
- Dashboard Fly app (`splash-accountability`) still exists but unused — destroy after Netlify is live.
- `NEXT_PUBLIC_API_URL` defaults to `http://localhost:8080` in `dashboard/lib/api.ts` — must be set in Netlify env.

---

# IMMEDIATE NEXT TASKS

1. ~~**Netlify import**~~ ✅ Done — https://splash-accountability.netlify.app
2. ~~**Set CORS secrets on Fly**~~ ✅ Done — locked to Netlify domain
3. **Update Twilio webhook URL** — 1 click in Twilio console (`https://splash-accountability-api.fly.dev/whatsapp/webhook`)
4. **Add `FLY_API_TOKEN` to GitHub secrets** — enables auto-deploy on push (`flyctl tokens create deploy -x 999999h`)
5. **Postgres migration** — before any real-user onboarding.
6. **Set Twilio sandbox join code in Fly:** `fly secrets set TWILIO_SANDBOX_JOIN_CODE=ask-simplest -a splash-accountability-api` — the onboarding card already reads `/api/config`; just needs the value.

---

# ROADMAP — Post-launch backlog

## A. Anthropic API at scale (own this before users grow past ~50)

**Plan: stay on personal key + instrument + add cheap wins. Graduate when monthly spend > ~$100 or rate limits hit.**

### A1. Token-usage tracking + admin spend widget — ✅ DONE
- `api_usage` table (db.py) — `(id, user_id, model, input_tokens, output_tokens, cost_usd, created_at)`. user_id is nullable for system/scheduled calls.
- `_call_with_retry` in ai.py logs every successful response via `record_api_usage()`. Failures swallowed — usage tracking never breaks a live reply.
- `PRICES` dict in ai.py covers Sonnet 4 / Opus 4 / Haiku 4.5 with a prefix-match fallback.
- `_current_user_id_ctx` ContextVar attributes calls to the right user; webhook sets it on inbound, agent sets it per scheduled job and in `process_evening_reply`.
- `GET /api/admin/usage?days=N` (admin-only) returns totals, by_day, by_model, top_users (top 5 hydrated), mtd_usd, projected_month_usd.
- Admin page now shows a 4-tile spend widget + by-model + top-users breakdown with a 7d/30d/90d window toggle.
- **Verify when live:** trigger any inbound message, then hit `/api/admin/usage` — the row should appear in `by_model` with non-zero cost.

### A2. Cheap wins (10x runway on the same key)
- **Switch classification calls to Haiku 4.5** in `ai.py` (intent detection, structured parsing). ~10× cheaper than Sonnet, indistinguishable quality for these tasks.
- **Enable prompt caching** on `SYSTEM_PROMPT` — Anthropic charges 10% of normal price for cache reads. For check-ins, the system prompt dominates input tokens → ~70-80% input cost reduction.
- **Per-user daily token cap** in DB. Hard-stop at e.g. 50K tokens/day for premium, 5K for free trial. Saves you from a runaway loop bug or abuse.
- **Batch API for non-realtime tasks** (morning summary generation, weekly trend writeups) — 50% discount.

### A3. Graduation criteria — move off personal key when ANY of:
- Monthly spend ≥ $100
- Hitting Tier 1 rate limits (50 RPM / 50K TPM on Sonnet 4)
- You want clean accounting separation (LLC formed, tax season)
- Action: open dedicated Anthropic org account → swap `ANTHROPIC_API_KEY` Fly secret → done. No code change.

## B. Landing-page motion (from prior brainstorm)

**Recommended combo for max wow / min effort:** 1 + 3 + 9 (~2 hours, zero deps).

### Tier 1 — drop in tonight
1. **Aurora bleed** — extend existing `.mesh-bg` with 3rd blob + higher opacity on `/landing`.
2. **Scroll-tied parallax** — hero copy + screenshot offset by scrollY × 0.3-0.6.
3. **Cursor-reactive spotlight** — radial-gradient following the mouse on the hero section.
4. **Counter "tick" on scroll into view** — animated count-up via `IntersectionObserver` + RAF.

### Tier 2 — half a day each
5. **Floating ghost goal cards** behind hero (sample goals drifting with CSS keyframes).
6. **Self-typing WhatsApp bubbles** — fake chat demo that loops every ~15s.
7. **Streak flame pulse** — SVG flame with scale + color-cycling drop-shadow.

### Tier 3 — weekend project, jaw-dropping
8. **Canvas particle field** — ~80 particles, mouse-reactive, line connections. Vanilla canvas, ~80 LOC.
9. **Ice score orb as hero element** — reuse `IceScoreOrb`, blow up to 280px, animate 0→100% on load. "The product is the marketing."
10. **WebGL gradient mesh** (à la stripe.com/2019) — fragment shader or `@whatisjery/react-fluid-distortion`. Highest wow per byte.

### Non-negotiables (free)
- All motion behind `@media (prefers-reduced-motion: no-preference)`.
- Mouse/scroll handlers throttled to `requestAnimationFrame`.
- Pause infinite animations on `document.visibilitychange === "hidden"`.
