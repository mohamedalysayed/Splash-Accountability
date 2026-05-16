#!/bin/bash
# Bootstrap a fresh machine — installs system-level deps (python3, node, CLIs),
# then hands off to ./setup.sh for the project-level deps.
# Idempotent: skips anything already installed.
#
# Supports: Linux (Debian/Ubuntu/WSL2) and macOS.
# Run from the repo root: ./bootstrap.sh

set -e
cd "$(dirname "$0")"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "\033[33m!\033[0m %s\n" "$1"; }
die()  { printf "\033[31mERROR:\033[0m %s\n" "$1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

bold "Splash Accountability — machine bootstrap"
echo

# ---- 1. Detect OS ----
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
elif [[ "$OSTYPE" == "linux-gnu"* ]] || grep -qi microsoft /proc/version 2>/dev/null; then
    OS="linux"
else
    die "Unsupported OS: $OSTYPE. Install Python 3.10+, Node 20+, flyctl, gh manually then run ./setup.sh"
fi
ok "Detected OS: $OS"

# ---- 2. Package manager prep ----
if [ "$OS" = "mac" ]; then
    if ! have brew; then
        bold "Installing Homebrew…"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    PKG_INSTALL="brew install"
    PKG_UPDATE="brew update"
else
    if ! have apt-get; then
        die "Only apt-based Linux is supported by this script. Install python3, node, flyctl, gh manually."
    fi
    PKG_INSTALL="sudo apt-get install -y"
    PKG_UPDATE="sudo apt-get update -qq"
    bold "Updating apt cache…"
    $PKG_UPDATE
fi

# ---- 3. Core build tools ----
if [ "$OS" = "linux" ]; then
    bold "Installing build essentials…"
    $PKG_INSTALL build-essential curl ca-certificates gnupg unzip zip ffmpeg
    ok "Build tools installed"
fi

# ---- 4. Python 3 ----
if ! have python3 || ! python3 -c 'import sys; assert sys.version_info >= (3,10)' 2>/dev/null; then
    bold "Installing Python 3.10+…"
    if [ "$OS" = "mac" ]; then
        $PKG_INSTALL python@3.11
    else
        $PKG_INSTALL python3 python3-venv python3-pip
    fi
fi
# venv module isn't bundled with system python on Ubuntu — install separately
if [ "$OS" = "linux" ] && ! python3 -c 'import venv' 2>/dev/null; then
    $PKG_INSTALL python3-venv
fi
ok "python3 $(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"

# ---- 5. Node.js 20 LTS + npm ----
if ! have node || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]; then
    bold "Installing Node.js 20 LTS…"
    if [ "$OS" = "mac" ]; then
        $PKG_INSTALL node@20
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        $PKG_INSTALL nodejs
    fi
fi
ok "node $(node -v), npm $(npm -v)"

# ---- 6. Fly CLI (deploys backend) ----
if ! have flyctl; then
    bold "Installing flyctl…"
    curl -L https://fly.io/install.sh | sh
    # add to PATH for current shell
    export FLYCTL_INSTALL="$HOME/.fly"
    export PATH="$FLYCTL_INSTALL/bin:$PATH"
    warn "Added flyctl to PATH for this shell. Add to your shell rc:"
    echo "    export FLYCTL_INSTALL=\"\$HOME/.fly\""
    echo "    export PATH=\"\$FLYCTL_INSTALL/bin:\$PATH\""
fi
ok "flyctl $(flyctl version | head -1 | awk '{print $2}')"

# ---- 7. GitHub CLI (for PRs / branch pushes) ----
if ! have gh; then
    bold "Installing gh (GitHub CLI)…"
    if [ "$OS" = "mac" ]; then
        $PKG_INSTALL gh
    else
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
            | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
            | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
        sudo apt-get update -qq
        sudo apt-get install -y gh
    fi
fi
ok "gh $(gh --version | head -1 | awk '{print $3}')"

# ---- 8. ngrok (optional — only used for local Twilio webhook tunneling) ----
if ! have ngrok; then
    bold "Installing ngrok (optional, for local WhatsApp dev)…"
    if [ "$OS" = "mac" ]; then
        $PKG_INSTALL ngrok/ngrok/ngrok || warn "ngrok install failed — skip if you don't need local WhatsApp testing"
    else
        curl -fsSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
            | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
        echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
            | sudo tee /etc/apt/sources.list.d/ngrok.list >/dev/null
        sudo apt-get update -qq && sudo apt-get install -y ngrok || warn "ngrok install failed"
    fi
fi
have ngrok && ok "ngrok $(ngrok version 2>&1 | head -1)" || warn "ngrok skipped (only needed for local WhatsApp testing)"

# ---- 9. Done — hand off to setup.sh ----
echo
bold "System dependencies ready. Now running ./setup.sh for project deps…"
echo
if [ -x ./setup.sh ]; then
    ./setup.sh
else
    chmod +x setup.sh && ./setup.sh
fi

echo
bold "Bootstrap complete."
echo
echo "Next steps:"
echo "  1. Copy your .env into this directory (or unzip your secrets bundle)."
echo "  2. Authenticate the CLIs:"
echo "       flyctl auth login"
echo "       gh auth login"
echo "  3. Launch:  ./start.sh"
