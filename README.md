# Splash Accountability

AI-powered daily accountability agent that holds you accountable on your goals via WhatsApp. Set goals each morning, get midday check-ins, review your progress every evening, and track your discipline over time through a glassmorphic web dashboard.

## How It Works

1. **Morning** — The agent asks for your top 3 goals + reminds you of recurring habits (gym, social media, etc.)
2. **Midday** — A progress check-in to keep you on track
3. **Evening** — The agent asks which goals you completed and calculates your daily score
4. **Anytime** — Message the bot anytime to log achievements, set goals, or chat
5. **Weekly** — Every Sunday, a summary of your week with patterns and encouragement

All messages are AI-generated and personalized based on your streak, score history, and individual goals.

## Features

- **WhatsApp delivery** via Twilio (or console mode for local development)
- **Smart AI conversations** — message the bot anytime, not just during check-ins
  - Detects goals, achievements, and completions from natural language
  - Logs achievements as completed goals automatically
  - Has natural conversations for general messages
- **Recurring reminders** — configurable daily habits (gym, social media, etc.)
- **Streak tracking** with daily scores and completion rates
- **Multi-user support** — each user gets individual check-ins and their own dashboard
- **JWT authentication** — register, login, link your WhatsApp number
- **Glassmorphic web dashboard** with 4 pages:
  - **Overview** — streak, today's score ring, 7-day average, score trend chart, goals bar chart
  - **Weekly** — animated day tiles, detail table, weekly completion rate ring
  - **Goal History** — filterable table, date range picker, common goal themes
  - **Trends** — completion trends, radar chart by day of week, completion by goal position

## Tech Stack

| Layer | Technology |
|---|---|
| Agent | Python, APScheduler |
| API | FastAPI, SQLAlchemy, SQLite |
| AI | Claude (Anthropic) — message generation, NLP parsing, intent classification |
| Messaging | Twilio WhatsApp API |
| Dashboard | Next.js 16, Tailwind CSS 4, Recharts |
| Auth | JWT, password hashing |
| Design | Glassmorphism, backdrop-filter, CSS animations, mesh gradients |

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/mohamedalysayed/Splash-Accountability.git
cd Splash-Accountability
cp .env.template .env
# Fill in your API keys in .env

# 2. Launch (installs deps automatically on first run)
chmod +x start.sh
./start.sh
```

This starts 3 processes (+ngrok if configured):
- **API server** on port 8080
- **Dashboard** on port 3000
- **ngrok tunnel** (if `MESSAGING_MODE=whatsapp` and `NGROK_AUTHTOKEN` is set)
- **Agent scheduler** (foreground)

Open `http://localhost:3000` to access the dashboard.

## WhatsApp Setup

1. Set `MESSAGING_MODE=whatsapp` in `.env`
2. Add your Twilio credentials and `NGROK_AUTHTOKEN`
3. Run `./start.sh` — it prints the webhook URL
4. Set the webhook URL in Twilio Console > WhatsApp Sandbox > "When a message comes in"
5. Join the sandbox by texting "join ask-simplest" to the Twilio number

## Console Mode (No Twilio Needed)

Set `MESSAGING_MODE=console` in `.env` to print messages to the terminal instead of sending via WhatsApp. Useful for development and testing.

## Architecture

```
+---------------------------------------------------+
|                   Your Machine                      |
|                                                     |
|  +----------+  +----------+  +-----------------+   |
|  | Agent    |  | API      |  | Dashboard       |   |
|  | Scheduler|  | (FastAPI)|  | (Next.js)       |   |
|  | :core    |  | :8080    |  | :3000           |   |
|  +----+-----+  +----+-----+  +--------+--------+   |
|       |              |                 |            |
|       +------+-------+                 |            |
|              |                         |            |
|         +----+----+              +-----+-----+      |
|         | SQLite  +--------------+ SQLite    |      |
|         | DB      |  (same db)   | reads     |      |
|         +---------+              +-----------+      |
+---------------------------------------------------+
              |                |
         +----+----+    +-----+-----+
         | Twilio  |    | ngrok     |
         |WhatsApp |    | tunnel    |
         +---------+    +-----------+
              |
         +----+----+
         | User's  |
         | Phone   |
         +---------+
```

## Project Structure

```
accountability-agent/
  agent.py          — Scheduler, multi-user check-in logic
  webhook.py        — FastAPI: Twilio webhook + REST API + auth + smart replies
  ai.py             — AI message generation, reply parsing, intent classification
  auth.py           — JWT tokens + password hashing
  config.py         — Settings from .env (incl. recurring reminders)
  db.py             — SQLAlchemy models + helper functions
  whatsapp.py       — Twilio messaging + console fallback + rate limiting
  start.sh          — Single-command launcher (API + dashboard + ngrok + agent)
  requirements.txt  — Python dependencies
  .env.template     — Example configuration
  data/             — SQLite database + logs
  dashboard/        — Next.js frontend (glassmorphic design)
```

## Configuration

All settings are in `.env`. See `.env.template` for the full list with descriptions.

Key settings:
- `MESSAGING_MODE` — `console` or `whatsapp`
- `ANTHROPIC_API_KEY` — Claude API key for AI features
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — Twilio credentials
- `USER_WHATSAPP_NUMBER` — Default user's phone in E.164 format
- `MORNING_TIME` / `MIDDAY_TIME` / `EVENING_TIME` — Check-in schedule (HH:MM)
- `RECURRING_REMINDERS` — Comma-separated daily habits (e.g. "Gym session,Post on social media")
- `JWT_SECRET` — Secret key for JWT token signing
- `NGROK_AUTHTOKEN` — ngrok token for automatic tunneling

## License

Proprietary. Copyright Splash-CFD Ltd.
