# Accountability Agent — Setup Guide

## Prerequisites

- Python 3.11+
- Node.js 18+ (for the dashboard)
- An Anthropic API key (Claude)
- (Optional) A Twilio account for WhatsApp delivery
- (Optional) ngrok for WhatsApp inbound tunneling

## Quick Start (Console Mode — No Twilio Needed)

### 1. Configure

```bash
cd accountability-agent
cp .env.template .env
```

Edit `.env`:
- **ANTHROPIC_API_KEY**: your Claude API key
- **USER_NAME**: your first name
- **MESSAGING_MODE**: leave as `console` (messages print to terminal)

### 2. Launch

```bash
chmod +x start.sh
./start.sh
```

That's it. The agent will start printing check-in messages to your terminal and the dashboard will be live at `http://localhost:3000`.

## Switching to WhatsApp (Twilio)

When you're ready to get real WhatsApp messages:

1. Create a [Twilio account](https://www.twilio.com/try-twilio) and activate the WhatsApp sandbox
2. Install ngrok: `curl -sSL https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz | tar xz -C ~/bin`
3. Auth ngrok: `ngrok config add-authtoken YOUR_TOKEN`
4. Update `.env`:
   ```
   MESSAGING_MODE=whatsapp
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_WHATSAPP_NUMBER=+14155238886
   USER_WHATSAPP_NUMBER=+41791234567
   NGROK_AUTHTOKEN=your_ngrok_token
   RECURRING_REMINDERS=Gym session,Post on social media
   ```
5. Run `./start.sh` — it auto-starts ngrok and prints the webhook URL
6. Set the webhook URL in Twilio Console > WhatsApp Sandbox > "When a message comes in"
7. Send "join ask-simplest" from your WhatsApp to the Twilio number
8. You're live!

## Architecture

| Process         | Port | Description                        |
|-----------------|------|------------------------------------|
| Agent Scheduler | —    | Sends timed check-ins via APScheduler |
| API Server      | 8080 | Twilio webhook + REST API (FastAPI)   |
| Dashboard       | 3000 | Glassmorphic web UI (Next.js)         |
| ngrok           | 4040 | Tunnel for WhatsApp inbound           |

All processes share a single SQLite database at `data/accountability.db`.

## Daily Flow

1. **Morning** (default 08:00) — Agent asks for top 3 goals + recurring reminders (gym, social media)
2. **Midday** (default 13:00) — Agent checks progress
3. **Evening** (default 19:00) — Agent asks which goals were completed
4. **Score** — After evening reply, agent calculates and sends daily score
5. **Anytime** — Message the bot to log achievements, set goals, or chat
6. **Weekly** — Every Sunday, agent sends a week-in-review summary

## Troubleshooting

- **Logs:** Check `data/agent.log` and terminal output
- **Database reset:** Delete `data/accountability.db` and restart — tables are auto-created
- **Rate limited?** Scheduled messages have 5-min cooldown; replies to your messages are instant
- **Port conflicts?** `pkill -9 -f uvicorn; pkill -9 -f "next dev"; pkill -9 -f ngrok` then restart
- **Twilio sandbox expired?** Re-send "join ask-simplest" every 72 hours
- **ngrok URL changed?** Update the webhook URL in Twilio Console
