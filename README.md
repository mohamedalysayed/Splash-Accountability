# Splash Accountability

AI-powered daily accountability agent that holds you accountable on your goals via WhatsApp. Set goals each morning, get midday check-ins, review your progress every evening, and track your discipline over time through a web dashboard.

## How It Works

1. **Morning** — The agent asks for your top 3 goals for the day
2. **Midday** — A progress check-in to keep you on track
3. **Evening** — The agent asks which goals you completed and calculates your daily score
4. **Weekly** — Every Sunday, a summary of your week with patterns and encouragement

All messages are AI-generated and personalized based on your streak, score history, and individual goals.

## Features

- **WhatsApp delivery** via Twilio (or console mode for local development)
- **AI-powered parsing** — understands natural language goal replies ("gym, finish report, call mom")
- **Streak tracking** with daily scores and completion rates
- **Multi-user support** — each user gets individual check-ins and their own dashboard
- **JWT authentication** — register, login, link your WhatsApp number
- **Web dashboard** with 4 pages:
  - **Overview** — streak, today's score, 7-day average, score trend chart, goals bar chart
  - **Weekly** — color-coded day tiles, detail table, weekly completion rate
  - **Goal History** — filterable table, date range picker, common goal themes
  - **Trends** — completion trends, best/worst day of week, completion by goal position

## Tech Stack

| Layer | Technology |
|---|---|
| Agent | Python, APScheduler |
| API | FastAPI, SQLAlchemy, SQLite |
| AI | LLM-powered message generation + NLP parsing |
| Messaging | Twilio WhatsApp API |
| Dashboard | Next.js 16, Tailwind CSS 4, Recharts |
| Auth | JWT, password hashing |

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

This starts 3 processes:
- **API server** on port 8080
- **Dashboard** on port 3000
- **Agent scheduler** (foreground)

Open `http://localhost:3000` to access the dashboard.

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
                        |
                   +----+----+
                   | Twilio  |
                   |WhatsApp |
                   +---------+
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
  webhook.py        — FastAPI: Twilio webhook + REST API + auth
  ai.py             — AI message generation + reply parsing
  auth.py           — JWT tokens + password hashing
  config.py         — Settings from .env
  db.py             — SQLAlchemy models + helper functions
  whatsapp.py       — Twilio messaging + console fallback
  start.sh          — Single-command launcher
  requirements.txt  — Python dependencies
  .env.template     — Example configuration
  data/             — SQLite database + logs
  dashboard/        — Next.js frontend application
```

## Configuration

All settings are in `.env`. See `.env.template` for the full list with descriptions.

Key settings:
- `MESSAGING_MODE` — `console` or `whatsapp`
- `ANTHROPIC_API_KEY` — AI API key for message generation
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — Twilio credentials
- `USER_WHATSAPP_NUMBER` — Default user's phone in E.164 format
- `MORNING_TIME` / `MIDDAY_TIME` / `EVENING_TIME` — Check-in schedule (HH:MM)
- `JWT_SECRET` — Secret key for JWT token signing

## License

Proprietary. Copyright Splash-CFD Ltd.
