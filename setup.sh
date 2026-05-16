#!/bin/bash
# Fresh-clone setup. After this, run ./start.sh to launch everything.
# Idempotent — safe to re-run.

set -e

cd "$(dirname "$0")"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
warn() { printf "\033[33m%s\033[0m\n" "$1"; }
ok()   { printf "\033[32m%s\033[0m\n" "$1"; }
die()  { printf "\033[31mERROR:\033[0m %s\n" "$1" >&2; exit 1; }

bold "Splash Accountability — fresh-clone setup"
echo

# 1. Prerequisites
command -v python3 >/dev/null || die "python3 not found. Install Python 3.10+."
command -v node    >/dev/null || die "node not found. Install Node 20+."
command -v npm     >/dev/null || die "npm not found."

PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
ok "python3 $PY_VER, node $(node -v), npm $(npm -v)"

# 2. .env bootstrap
if [ ! -f .env ]; then
    bold "Creating .env from .env.template…"
    cp .env.template .env

    # Auto-generate a JWT secret so the user doesn't need to think about it.
    JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
    # macOS sed vs GNU sed compatibility
    if sed --version >/dev/null 2>&1; then
        sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
    else
        sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
    fi
    ok "JWT_SECRET auto-generated."

    echo
    bold "Required next: edit .env and set:"
    echo "  - ANTHROPIC_API_KEY     (get one at https://console.anthropic.com)"
    echo "  - USER_WHATSAPP_NUMBER  (your number in E.164, e.g. +41XXXXXXXXX)"
    echo "  - USER_NAME"
    echo
    echo "Optional (only if MESSAGING_MODE=whatsapp):"
    echo "  - TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN"
    echo
    echo "Default MESSAGING_MODE=console prints messages to terminal — perfect for first run."
    echo
else
    ok ".env already present — leaving as-is."
fi

# 3. Python venv + deps
if [ ! -d venv ]; then
    bold "Creating Python virtualenv…"
    python3 -m venv venv
fi
# shellcheck disable=SC1091
source venv/bin/activate
bold "Installing Python dependencies…"
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
ok "Python deps installed."

# 4. Dashboard deps
if [ ! -d dashboard/node_modules ]; then
    bold "Installing dashboard dependencies…"
    (cd dashboard && npm install --silent)
    ok "Dashboard deps installed."
else
    ok "dashboard/node_modules present — skipping npm install."
fi

# 5. DB init
bold "Initializing SQLite database…"
mkdir -p data
python -c "from db import init_db; init_db()"
ok "DB ready at data/accountability.db"

echo
bold "Setup complete."
echo "Next:  ./start.sh"
