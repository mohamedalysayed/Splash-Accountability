# Pickup Guide — Where You Left Off (May 16, 2026)

## What's Working

| Feature | Status | Notes |
|---|---|---|
| Agent scheduler | Working | Multi-user, sends check-ins at 08:00/13:00/19:00 Europe/Zurich |
| WhatsApp outbound | Working | Twilio sandbox, messages send to user's phone |
| WhatsApp inbound | Working | ngrok tunnel, AI-powered smart replies |
| Smart conversations | Working | Bot detects goals, achievements, completions from freeform messages |
| Recurring reminders | Working | Gym + social media included in every morning check-in |
| Dashboard (Next.js) | Working | http://localhost:3000 — glassmorphic design |
| API server (FastAPI) | Working | http://localhost:8080 |
| Auth (JWT) | Working | Register/login/protected routes |
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
cd /home/mohamed/Development/codes/accountability-agent
./start.sh
```

This launches 4 processes:
1. **API server** on port 8080
2. **Next.js dashboard** on port 3000
3. **ngrok tunnel** (prints webhook URL — set this in Twilio if it changes)
4. **Agent scheduler** (foreground)

**Important**: If you get port conflicts (`EADDRINUSE`), kill stale processes first:
```bash
pkill -9 -f uvicorn; pkill -9 -f "next dev"; pkill -9 -f ngrok; pkill -9 -f "python agent"
sleep 2
./start.sh
```

## How WhatsApp Works Now

The bot is smart about messages at any time of day:
- **"Here's what I did: gym, wrote blog post"** → saves as completed achievements, calculates score
- **"My goals today: finish report, gym, call client"** → saves as today's goals
- **"Did I hit my targets?"** → has a natural conversation
- **Morning/midday/evening check-ins** → standard scheduled flow with recurring reminders

Rate limiting: outbound scheduled messages have a 5-min cooldown, but replies to your messages are instant.

## Project Structure

```
accountability-agent/
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
      auth.tsx      — AuthProvider context
```

## Key Architecture Decisions

- **Single SQLite DB** shared by agent, webhook, and API. No migrations tool — just `init_db()` with `create_all()`. If you change the schema, delete `data/accountability.db` and restart.
- **Single user account**: Mohamed Sayed (id=2, muhammmedaly@gmail.com, phone=+41766977284). Old user id=1 was deleted.
- **Smart reply system**: Freeform messages are classified by AI into intents (set_goals, report_achievements, report_completions, general). Achievements are saved as completed goals.
- **Console mode**: Set `MESSAGING_MODE=console` in `.env` to print messages to terminal instead of WhatsApp.
- **Sandbox re-join**: Twilio sandbox expires after 72 hours. Must re-send "join ask-simplest" to stay connected.
- **Laptop required**: Currently all services run locally. Deploying to cloud (Phase 6) removes this requirement.

## Next Up — Voice Notes (Phase 5)

The next feature to build:
1. **Receive voice notes** — Twilio sends audio as `MediaUrl0` in webhook POST
2. **Download audio** — fetch the media file using Twilio credentials
3. **Transcribe** — send audio to Claude (supports audio input) or Whisper API
4. **Process** — run transcription through the same `classify_freeform_message()` pipeline
5. **Reply** — respond on WhatsApp as usual

This means you can speak your goals/achievements and the bot processes them just like text.

## What Still Needs Work

See ROADMAP.md for full list. Top priorities:
1. **Voice notes** (Phase 5) — speak your achievements
2. **Habit tracking** — per-habit streaks and frequency targets
3. **Deploy to cloud** (Phase 6) — no laptop required, 24/7 operation
4. **Production WhatsApp** — move from sandbox to Twilio Business API
