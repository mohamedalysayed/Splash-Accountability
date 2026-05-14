#!/bin/bash
# Launches agent + webhook + Next.js dashboard

set -e

# Check .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Copy .env.template and fill in your credentials."
    echo "  cp .env.template .env"
    exit 1
fi

# Create data directory
mkdir -p data

# Set up Python virtual environment if needed
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "Installing Python dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Install Next.js dependencies if needed
if [ ! -d "dashboard/node_modules" ]; then
    echo "Installing dashboard dependencies..."
    cd dashboard && npm install && cd ..
fi

# Initialize database
python -c "from db import init_db; init_db()"

# Cleanup function
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $WEBHOOK_PID $DASHBOARD_PID $NGROK_PID 2>/dev/null
    exit 0
}
trap cleanup EXIT INT TERM

# Load env vars for port config
source .env 2>/dev/null || true

MODE=${MESSAGING_MODE:-console}
echo ""
echo "  Mode: ${MODE^^}"
if [ "$MODE" = "console" ]; then
    echo "  (Messages will print to terminal. Set MESSAGING_MODE=whatsapp for Twilio.)"
fi
echo ""

# Start webhook + API server (background)
echo "Starting API server on port ${WEBHOOK_PORT:-8080}..."
uvicorn webhook:app --host 0.0.0.0 --port ${WEBHOOK_PORT:-8080} &
WEBHOOK_PID=$!

# Start Next.js dashboard (background)
DASHBOARD_PORT=${DASHBOARD_PORT:-3000}
echo "Starting dashboard on port ${DASHBOARD_PORT}..."
(cd dashboard && NEXT_PUBLIC_API_URL=http://localhost:${WEBHOOK_PORT:-8080} npx next dev --port ${DASHBOARD_PORT}) &
DASHBOARD_PID=$!

# Optional: start ngrok tunnel (only in whatsapp mode)
NGROK_PID=""
if [ "$MODE" = "whatsapp" ] && [ -n "$NGROK_AUTHTOKEN" ]; then
    echo "Starting ngrok tunnel..."
    ngrok http ${WEBHOOK_PORT:-8080} --log=stdout > /dev/null &
    NGROK_PID=$!
    sleep 3
    WEBHOOK_URL=$(curl -s http://localhost:4040/api/tunnels | python -c "import sys,json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null || echo "UNKNOWN")
    echo ""
    echo "=========================================="
    echo "  WEBHOOK URL (set this in Twilio):"
    echo "  ${WEBHOOK_URL}/webhook"
    echo "=========================================="
fi

# Give services a moment to start
sleep 3

echo ""
echo "=========================================="
echo "  All systems running!"
echo "  API:       http://localhost:${WEBHOOK_PORT:-8080}"
echo "  Dashboard: http://localhost:${DASHBOARD_PORT}"
echo "  Health:    http://localhost:${WEBHOOK_PORT:-8080}/health"
echo "=========================================="
echo ""

# Start agent scheduler (foreground — blocks until Ctrl+C)
echo "Starting accountability agent..."
python agent.py
