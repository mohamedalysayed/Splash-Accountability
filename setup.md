# Accountability Agent — Setup Guide

## Prerequisites

- Python 3.11+
- An AI API key (for message generation)
- (Optional) A Twilio account for WhatsApp delivery

## Quick Start (Console Mode — No Twilio Needed)

### 1. Configure

```bash
cd accountability-agent
cp .env.template .env
```

Edit `.env`:
- **ANTHROPIC_API_KEY**: your AI API key
- **USER_NAME**: your first name
- **MESSAGING_MODE**: leave as `console` (messages print to terminal)

### 2. Launch

```bash
chmod +x start.sh
./start.sh
```

That's it. The agent will start printing check-in messages to your terminal and the dashboard will be live at `http://localhost:8501`.

### 3. Test manually

```bash
source venv/bin/activate
python -c "from agent import morning_check_in; morning_check_in()"
```

## Switching to WhatsApp (Twilio)

When you're ready to get real WhatsApp messages:

1. Create a [Twilio account](https://www.twilio.com/try-twilio) and activate the WhatsApp sandbox
2. Update `.env`:
   ```
   MESSAGING_MODE=whatsapp
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_WHATSAPP_NUMBER=+14155238886
   USER_WHATSAPP_NUMBER=+41791234567
   ```
3. Set up ngrok or a tunnel and point Twilio's sandbox webhook to `https://your-url/webhook`
4. Send the sandbox join message from your WhatsApp
5. Restart: `./start.sh`

See [ROADMAP.md](ROADMAP.md) for the full plan.

## Architecture

| Process         | Port | Description                        |
|-----------------|------|------------------------------------|
| Agent Scheduler | —    | Sends timed messages via APScheduler |
| Webhook Server  | 8080 | Receives replies (FastAPI)           |
| Dashboard       | 8501 | Stats visualization (Streamlit)      |

All three share a single SQLite database at `data/accountability.db`.

## Daily Flow

1. **Morning** (default 08:00) — Agent asks for top 3 goals
2. **Midday** (default 13:00) — Agent checks progress
3. **Evening** (default 19:00) — Agent asks which goals were completed
4. **Score** — After evening reply, agent calculates and sends daily score
5. **Weekly** — Every Sunday, agent sends a week-in-review summary

## Troubleshooting

- **Logs:** Check `data/agent.log`
- **Database reset:** Delete `data/accountability.db` and restart — tables are auto-created
- **Rate limited?** 5-minute minimum between outbound messages (configurable)
