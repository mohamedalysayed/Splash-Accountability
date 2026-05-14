# Pickup Guide — Where You Left Off (May 15, 2026)

## What's Working

| Feature | Status | Notes |
|---|---|---|
| Agent scheduler | Working | Multi-user, sends check-ins at 08:00/13:00/19:00 Europe/Zurich |
| WhatsApp outbound | Working | Twilio sandbox, messages send to your phone |
| WhatsApp inbound | **BROKEN** | Twilio has no webhook URL — your replies go nowhere |
| Dashboard (Next.js) | Working | http://localhost:3000 |
| API server (FastAPI) | Working | http://localhost:8080 |
| Auth (JWT) | Working | Register/login/protected routes |
| Database | SQLite | 14 days of seeded demo data |

## Your Credentials

All secrets are in `.env` (not committed to git). Key values:
- **Dashboard login**: splashcfd@gmail.com / splash123
- **Twilio credentials**: in `.env` as `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- **WhatsApp number**: in `.env` as `USER_WHATSAPP_NUMBER`
- **Twilio sandbox**: +14155238886 (rejoin every 72h with "join ask-simplest")
- **AI API key**: in `.env` as `ANTHROPIC_API_KEY`

## How to Start Everything

```bash
cd /home/mohamed/Development/codes/accountability-agent
./start.sh
```

This launches 3 processes:
1. **API server** on port 8080
2. **Next.js dashboard** on port 3000
3. **Agent scheduler** (foreground)

## Priority #1: Fix WhatsApp Inbound (ngrok)

Your replies to the agent don't work because Twilio can't reach your localhost. Fix:

### Step 1: Get ngrok
```bash
# Install ngrok (if not installed)
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok-v3-stable-linux-amd64.tgz | tar xz
sudo mv ngrok /usr/local/bin/

# Or: snap install ngrok
```

### Step 2: Auth ngrok
```bash
# Sign up at ngrok.com, copy your auth token, then:
ngrok config add-authtoken YOUR_TOKEN

# Or set in .env:
# NGROK_AUTHTOKEN=YOUR_TOKEN
```

### Step 3: Start tunnel
```bash
ngrok http 8080
```
This gives you a URL like `https://abc123.ngrok-free.app`

### Step 4: Configure Twilio
1. Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. Click "Sandbox settings"
3. Set "When a message comes in" to: `https://abc123.ngrok-free.app/webhook`
4. Method: POST
5. Save

### Step 5: Test
Send a message on WhatsApp to +14155238886. The agent should parse your goals and reply with confirmation.

## Project Structure

```
accountability-agent/
  agent.py          — APScheduler, multi-user check-ins
  webhook.py        — FastAPI: Twilio webhook + REST API + auth
  ai.py             — AI message generation + reply parsing
  auth.py           — JWT + password hashing
  config.py         — Settings from .env
  db.py             — SQLAlchemy models + helpers
  whatsapp.py       — Twilio send + console fallback
  start.sh          — Launches everything
  requirements.txt  — Python deps
  .env              — Secrets (not in git)
  .env.template     — Example config
  data/             — SQLite DB + logs
  dashboard/        — Next.js frontend
    app/
      page.tsx      — Overview
      weekly/       — Weekly view
      goals/        — Goal history
      trends/       — Trends
      login/        — Login page
      register/     — Register page
      components/   — Sidebar, MetricCard, ClientLayout
    lib/
      api.ts        — API client with auth
      auth.tsx      — AuthProvider context
```

## Key Architecture Decisions

- **Single SQLite DB** shared by agent, webhook, and API. No migrations tool — just `init_db()` with `create_all()`. If you change the schema, delete `data/accountability.db` and restart.
- **Multi-user**: Agent iterates all active users in DB. Anyone who texts the Twilio number gets auto-registered. Dashboard users register with email+password and link their phone.
- **Console mode**: Set `MESSAGING_MODE=console` in `.env` to print messages to terminal instead of WhatsApp. Useful for development.
- **Rate limiting**: 5-minute minimum between outbound messages per user.
- **Sandbox re-join**: Twilio sandbox expires after 72 hours. Users must re-send "join ask-simplest" to stay connected.

## What Still Needs Work

See ROADMAP.md for full list. Top priorities:
1. **ngrok / webhook URL** — makes inbound WhatsApp work
2. **Dashboard design polish** — being redesigned for clean light+dark theme
3. **Deploy frontend** to Vercel + backend to Railway/Fly.io
4. **Production WhatsApp** — move from sandbox to Twilio Business API
