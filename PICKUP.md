# Pickup Guide — Where You Left Off (May 16, 2026)

## What's Working

| Feature | Status | Notes |
|---|---|---|
| Agent scheduler | Working | Multi-user, sends check-ins at 08:00/13:00/19:00 Europe/Zurich |
| WhatsApp outbound | Working | Twilio sandbox, messages send to user's phone |
| WhatsApp inbound | Working | ngrok tunnel, AI-powered smart replies |
| Smart conversations | Working | Bot detects goals, achievements, completions from freeform messages |
| Voice notes | Working | Send voice notes on WhatsApp, auto-transcribed via Claude, processed as text |
| Recurring reminders | Working | Gym + social media included in every morning check-in |
| Dashboard (Next.js) | Working | http://localhost:3000 — glassmorphic design |
| API server (FastAPI) | Working | http://localhost:8080 |
| Auth (JWT) | Working | Register/login/protected routes |
| Phone linking | Working | Settings page: link WhatsApp number, auto-merges all historical data |
| Database | SQLite | Fresh start on May 16 — old demo data cleared |

## Your Credentials

All secrets are in `.env` (not committed to git). Key values:
- **Dashboard login**: muhammmedaly@gmail.com (user id=2)
- **Twilio credentials**: in `.env` as `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- **WhatsApp number**: +41766977284 (linked to dashboard account)
- **Twilio sandbox**: +14155238886 (rejoin every 72h with "join ask-simplest")
- **AI API key**: in `.env` as `ANTHROPIC_API_KEY` (Claude Haiku 4.5)
- **ngrok**: auto-configured, token in `.env`

## How to Start Everything

```bash
cd /home/mohamed/Development/codes/Splash-Accountability
./start.sh
```

This launches 4 processes:
1. **API server** on port 8080
2. **Next.js dashboard** on port 3000
3. **ngrok tunnel** (prints webhook URL — set this in Twilio if it changes)
4. **Agent scheduler** (foreground)

`start.sh` now auto-kills stale processes on ports 3000/8080 before starting, so port conflicts should be resolved automatically.

## How WhatsApp Works Now

The bot is smart about messages at any time of day:
- **"Here's what I did: gym, wrote blog post"** → saves as completed achievements, calculates score
- **"My goals today: finish report, gym, call client"** → saves as today's goals
- **"Did I hit my targets?"** → has a natural conversation
- **Morning/midday/evening check-ins** → standard scheduled flow with recurring reminders

Rate limiting: outbound scheduled messages have a 5-min cooldown, but replies to your messages are instant.

## Project Structure

```
Splash-Accountability/
  agent.py          — APScheduler, multi-user check-ins, recurring reminders
  webhook.py        — FastAPI: Twilio webhook + REST API + auth + AI intent routing
  ai.py             — Claude AI: message generation, parsing, freeform classification
  auth.py           — JWT + password hashing
  config.py         — Settings from .env (incl. RECURRING_REMINDERS)
  db.py             — SQLAlchemy models + helpers
  whatsapp.py       — Twilio send + console fallback + rate limiting (with reply bypass)
  start.sh          — Launches everything (API + dashboard + ngrok + agent)
  requirements.txt  — Python deps
  .env              — Secrets (not in git)
  .env.template     — Example config
  data/             — SQLite DB + logs
  dashboard/        — Next.js frontend (glassmorphic design)
    app/
      page.tsx      — Overview (score ring, charts, streak)
      weekly/       — Weekly view (animated day tiles, table)
      goals/        — Goal history (filters, themes chart)
      trends/       — Trends (radar, position bars, area chart)
      login/        — Login page
      register/     — Register page
      globals.css   — Glassmorphism theme (glass cards, mesh bg, animations)
      components/   — Sidebar, MetricCard, ClientLayout
    lib/
      api.ts        — API client with auth
      auth.tsx      — AuthProvider context (single redirect controller)
```

## Key Architecture Decisions

- **Single SQLite DB** shared by agent, webhook, and API. No migrations tool — just `init_db()` with `create_all()`. If you change the schema, delete `data/accountability.db` and restart.
- **Single user account**: Mohamed Sayed (id=2, muhammmedaly@gmail.com, phone=+41766977284). Old user id=1 was deleted.
- **Smart reply system**: Freeform messages are classified by AI into intents (set_goals, report_achievements, report_completions, general). Achievements are saved as completed goals.
- **Auth redirect**: ALL auth redirects go through `AuthProvider` in `dashboard/lib/auth.tsx`. No competing `window.location.href` redirects. The `fetchJSON` in `api.ts` throws on 401 but does NOT redirect — the provider handles it.
- **Console mode**: Set `MESSAGING_MODE=console` in `.env` to print messages to terminal instead of WhatsApp.
- **Sandbox re-join**: Twilio sandbox expires after 72 hours. Must re-send "join ask-simplest" to stay connected.
- **Laptop required**: Currently all services run locally. Deploying to cloud (Phase 6) removes this requirement.

## Known Issues Fixed on May 16

1. **Port conflicts**: `start.sh` now auto-kills stale processes via `fuser -k` before starting.
2. **Auth redirect loop**: Was caused by 3 competing redirect mechanisms (`clearTokenAndRedirect` in fetchJSON, two useEffects in AuthProvider). Fixed by centralizing all redirects in AuthProvider and removing the hard redirect from fetchJSON.
3. **Score ring clipping**: Removed global `overflow: hidden` from `.card` CSS class. Tables that need it use inline `style={{ overflow: 'hidden' }}`.
4. **Turbopack panics**: Cleared `.next` cache. If it recurs, `rm -rf dashboard/.next` and restart.

## What Still Needs Work

See ROADMAP.md for full list. **Immediate next tasks:**

1. **Google OAuth login** — see ROADMAP.md Phase 4.5 (Task A)
2. **Deploy to production** — see Deployment Architecture below

**Already done (May 16 evening session):**
- WhatsApp-to-dashboard user merge — `link_phone_to_user()` merges all data
- Phone linking UI — Settings page at `/settings`
- Voice notes — Phase 5 complete: voice → transcribe (Google Speech) → classify → log
- Date detection — "on Friday I did X" logs to the correct past date
- Landing page — `/landing` with realistic iPhone mockup, vitreous buttons, light/dark auto

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                          │
│              Netlify (free tier)                     │
│  dashboard/ → next build → static export            │
│  Custom domain, global CDN, auto-deploy from git    │
│  Landing page: /landing (public, no auth)           │
│  Dashboard: / (auth required)                       │
└──────────────────┬──────────────────────────────────┘
                   │ NEXT_PUBLIC_API_URL
                   ▼
┌─────────────────────────────────────────────────────┐
│                    BACKEND                           │
│              Fly.io ($1.94/mo)                       │
│  webhook.py (FastAPI) → uvicorn                     │
│  agent.py (APScheduler) — runs as background worker │
│  fly.toml: 256MB shared-cpu-1x                      │
│  Persistent volume: /data (1GB) for SQLite          │
│  Region: cdg (Zurich-adjacent)                      │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   Twilio API            Anthropic API
   (WhatsApp)            (AI coaching)
```

### Frontend: Netlify (free)
- `cd dashboard && next build` produces static/SSR output
- Connect GitHub repo → auto-deploy on push
- Set env var: `NEXT_PUBLIC_API_URL=https://splash-api.fly.dev`
- Free SSL, global CDN, 100GB bandwidth/mo

### Backend: Fly.io (~$2/mo)
- Single machine: `shared-cpu-1x` with 256MB RAM
- Persistent volume mounted at `/data` for SQLite DB
- Dockerfile runs both `uvicorn webhook:app` and `python agent.py` via supervisord
- Region: `cdg` (Paris, closest to Zurich)
- Auto-restart, health checks at `/health`
- Custom domain optional: `api.splashaccountability.com`

### Deployment steps (Phase 6):
1. `fly launch` in project root → creates fly.toml
2. `fly volumes create data --size 1 --region cdg`
3. `fly secrets set ANTHROPIC_API_KEY=... TWILIO_ACCOUNT_SID=... ...`
4. `fly deploy`
5. Update Twilio webhook URL to `https://splash-api.fly.dev/webhook`
6. Netlify: connect repo, set build command `cd dashboard && npm run build`

### Migration checklist:
- [ ] Move from SQLite to PostgreSQL (Fly.io Postgres or Neon free tier)
- [ ] Or keep SQLite on persistent volume (simpler, fine for <1000 users)
- [ ] Set `JWT_SECRET` as a persistent env var (not random on restart)
- [ ] Production WhatsApp number (Twilio Business API)
- [ ] Stripe integration for $0.99/mo billing

---

# TOMORROW'S TASKS

**1. Google OAuth** — see ROADMAP.md Phase 4.5 (Task A)
- Get Client ID from Google Cloud Console
- Add `POST /api/auth/google` endpoint
- Add "Sign in with Google" button to login/register
- `pip install google-auth`

**2. Deploy** — see architecture above
- `fly launch` + `fly deploy` for backend
- Netlify connect for frontend
