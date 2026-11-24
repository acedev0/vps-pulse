#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="/opt/vps-pulse"
CONFIG_DIR="/etc/vps-pulse"
ENV_FILE="$CONFIG_DIR/vps-pulse.env"
REPO_URL="https://github.com/acedev0/vps-pulse.git"
BRANCH="main"

# Reopen stdin from /dev/tty if running via curl pipe (e.g. curl ... | bash)
if [ ! -t 0 ] && [ -e /dev/tty ]; then
  exec < /dev/tty
fi

if [[ -t 1 ]]; then
  GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'
else
  GREEN=''; CYAN=''; YELLOW=''; RED=''; BOLD=''; RESET=''
fi

info() { printf "${CYAN}●${RESET} %s\n" "$*"; }
success() { printf "${GREEN}✓${RESET} %s\n" "$*"; }
warn() { printf "${YELLOW}⚠${RESET} %s\n" "$*"; }
die() { printf "${RED}Error:${RESET} %s\n" "$*" >&2; exit 1; }

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Please run this installer as root (e.g. sudo bash install.sh)."

clear || true
cat << 'EOF'
 __      _______   _____   _____  _    _ _       _____ ______ 
 \ \    / /  __ \ / ____| |  __ \| |  | | |     / ____|  ____|
  \ \  / /| |__) | (___   | |__) | |  | | |    | (___ | |__   
   \ \/ / |  ___/ \___ \  |  ___/| |  | | |     \___ \|  __|  
    \  /  | |     ____) | | |    | |__| | |____ ____) | |____ 
     \/   |_|    |_____/  |_|     \____/|______|_____/|______|
EOF
printf "\n%s\n" "${BOLD}⚡ Real-Time Linux VPS Telemetry & 3D Network Command Center${RESET}"
printf "%s\n\n" "Universal installer for Ubuntu, Debian, CentOS, AlmaLinux, and Rocky Linux."

# 1. System Package Installation
install_system_dependencies() {
  info "Checking system dependencies..."
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y -qq
    apt-get install -y -qq curl git tar iproute2 procps ca-certificates build-essential
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y curl git tar iproute procps ca-certificates
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl git tar iproute procps ca-certificates
  elif command -v pacman >/dev/null 2>&1; then
    pacman -Sy --noconfirm curl git tar iproute2 procps
  fi
  success "System prerequisites installed."
}

# 2. Node.js Verification / Installation (Requires Node 18+)
install_nodejs() {
  local need_install=0
  if ! command -v node >/dev/null 2>&1; then
    need_install=1
  else
    local node_ver
    node_ver="$(node -v | sed 's/v//' | cut -d. -f1)"
    if (( node_ver < 18 )); then
      need_install=1
    fi
  fi

  if [[ $need_install -eq 1 ]]; then
    info "Installing Node.js 20 LTS..."
    if command -v apt-get >/dev/null 2>&1; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
    elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
      yum install -y nodejs
    fi
  fi
  success "Node.js $(node -v) is ready."
}

install_system_dependencies
install_nodejs

# 3. Clone or Update Repository
info "Setting up application directory at $INSTALL_DIR..."
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Updating existing installation..."
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  mkdir -p "$INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
success "Source code prepared."

# 4. Interactive Configuration Wizard
DETECTED_IP="$(curl -4fsS --max-time 4 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")"
DEFAULT_HOSTNAME="$(hostname 2>/dev/null || echo "linux-vps")"

printf "\n%s\n" "${CYAN}══════════════════════════════════════════════════════════════${RESET}"
printf "%s\n" "${BOLD}   VPS PULSE // INTERACTIVE SETUP WIZARD${RESET}"
printf "%s\n\n" "${CYAN}══════════════════════════════════════════════════════════════${RESET}"

# Step 1: Port Selection
SELECTED_PORT=""
while true; do
  printf "${BOLD}[1/4] Web Dashboard & Telemetry Port${RESET}\n"
  read -rp "      Enter port to run VPS Pulse on [default: 7777]: " input_port
  SELECTED_PORT="${input_port:-7777}"

  if ! [[ "$SELECTED_PORT" =~ ^[0-9]+$ ]] || (( SELECTED_PORT < 1 || SELECTED_PORT > 65535 )); then
    warn "Invalid port '$SELECTED_PORT'. Must be a number between 1 and 65535."
    continue
  fi

  # Check if port is already listening by another process
  if ss -tuln 2>/dev/null | grep -q ":${SELECTED_PORT} "; then
    warn "Port $SELECTED_PORT is already in use by another service on this host!"
    read -rp "      Do you still want to use port $SELECTED_PORT? [y/N]: " force_port
    if [[ "$force_port" =~ ^[Yy]$ ]]; then
      break
    fi
  else
    break
  fi
done
success "Configured port: $SELECTED_PORT"
echo ""

# Step 2: Server Display Label
printf "${BOLD}[2/4] Node Display Name${RESET}\n"
read -rp "      Enter custom server label [default: $DEFAULT_HOSTNAME]: " input_name
SELECTED_NODE_NAME="${input_name:-$DEFAULT_HOSTNAME}"
success "Configured node name: $SELECTED_NODE_NAME"
echo ""

# Step 3: Public IP / Anchor
printf "${BOLD}[3/4] Public IP & Location Anchor${RESET}\n"
printf "      Auto-detected Public IP: %s\n" "${CYAN}$DETECTED_IP${RESET}"
read -rp "      Press Enter to keep, or enter custom IP/domain: " input_ip
SELECTED_HOST_IP="${input_ip:-$DETECTED_IP}"
success "Configured host IP: $SELECTED_HOST_IP"
echo ""

# Step 4: Process Manager
printf "${BOLD}[4/4] Process Manager${RESET}\n"
printf "      1) systemd background service (Recommended, auto-restart on boot)\n"
printf "      2) PM2 process manager\n"
read -rp "      Select option [1]: " input_pm
SELECTED_PM="${input_pm:-1}"

# Save Environment File
mkdir -p "$CONFIG_DIR"
cat > "$ENV_FILE" << EOF
PORT=$SELECTED_PORT
NODE_NAME="$SELECTED_NODE_NAME"
HOST_IP="$SELECTED_HOST_IP"
NODE_ENV="production"
EOF

cp "$ENV_FILE" "$INSTALL_DIR/.env"
success "Configuration saved to $ENV_FILE"

# 5. Build Application
info "Installing Node dependencies (this may take a minute)..."
cd "$INSTALL_DIR"
npm install --silent

info "Compiling React + Three.js frontend..."
npm run build --silent
success "Build completed successfully."

# 6. Service Installation
if [[ "$SELECTED_PM" == "2" ]] && command -v pm2 >/dev/null 2>&1; then
  info "Starting via PM2..."
  pm2 delete vps-pulse >/dev/null 2>&1 || true
  PORT="$SELECTED_PORT" HOST_IP="$SELECTED_HOST_IP" NODE_NAME="$SELECTED_NODE_NAME" pm2 start server/index.js --name "vps-pulse"
  pm2 save
  success "Started with PM2"
else
  info "Setting up systemd service..."
  cat > "/etc/systemd/system/vps-pulse.service" << EOF
[Unit]
Description=VPS Pulse Real-Time Telemetry & 3D Network Command Center
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=-$ENV_FILE
ExecStart=$(command -v node) $INSTALL_DIR/server/index.js
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now vps-pulse.service
  success "systemd service 'vps-pulse' enabled and started."
fi

# 7. Install CLI Controller Tool
install -m 0755 "$INSTALL_DIR/scripts/vpspulsectl" /usr/local/bin/vpspulsectl
success "Installed management CLI: 'vpspulsectl'"

# 8. Firewall Configuration
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  ufw allow "${SELECTED_PORT}/tcp" >/dev/null 2>&1 || true
  success "Allowed TCP port $SELECTED_PORT in UFW firewall."
elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
  firewall-cmd --quiet --permanent --add-port="${SELECTED_PORT}/tcp" 2>/dev/null || true
  firewall-cmd --quiet --reload 2>/dev/null || true
  success "Allowed TCP port $SELECTED_PORT in firewalld."
fi

# 9. Verification & Finish
sleep 2
printf "\n%s\n" "${GREEN}╔════════════════════════════════════════════════════════════════╗${RESET}"
printf "%s\n"   "${GREEN}║              ⚡ VPS PULSE INSTALLED SUCCESSFULLY!              ║${RESET}"
printf "%s\n"   "${GREEN}╚════════════════════════════════════════════════════════════════╝${RESET}"
printf "\n%s\n" "${BOLD}🌐 Web Dashboard URL:${RESET}  ${CYAN}http://${SELECTED_HOST_IP}:${SELECTED_PORT}${RESET}"
printf "\n%s\n" "Management Commands:"
printf "  ${BOLD}vpspulsectl status${RESET}     - View live service status\n"
printf "  ${BOLD}vpspulsectl logs${RESET}       - Stream real-time logs\n"
printf "  ${BOLD}vpspulsectl port [N]${RESET}   - Switch web port instantly\n"
printf "  ${BOLD}vpspulsectl restart${RESET}    - Safely restart server\n"
printf "  ${BOLD}vpspulsectl update${RESET}     - Update to latest GitHub release\n"
printf "  ${BOLD}vpspulsectl uninstall${RESET}  - Cleanly remove VPS Pulse\n\n"
EOF
