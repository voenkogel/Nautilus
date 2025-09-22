#!/usr/bin/env bash

# Nautilus Proxmox LXC Installer
# Network Infrastructure Monitor
# Repository: https://github.com/voenkogel/nautilus

set -Eeuo pipefail
trap cleanup SIGINT SIGTERM ERR EXIT

# Colors for output
RD='\033[01;31m'
YW='\033[33m'
GN='\033[1;92m'
BL='\033[36m'
CL='\033[m'
BFR="\\r\\033[K"
HOLD="-"

# Default configuration
APP="Nautilus"
var_cpu="2"
var_ram="1024"
var_disk="8"
var_os="ubuntu"
var_version="22.04"
NSAPP=$(echo ${APP,,} | tr -d ' ')
var_install="${NSAPP}-install"
timezone=$(cat /etc/timezone)
INTEGER='^[0-9]+([.][0-9]+)?$'

# Functions
header_info() {
clear
cat <<"EOF"
    _   _             _   _ _           
   | \ | | __ _ _   _| |_(_) |_   _ ___ 
   |  \| |/ _` | | | | __| | | | | / __|
   | |\  | (_| | |_| | |_| | | |_| \__ \
   |_| \_|\__,_|\__,_|\__|_|_|\__,_|___/
                                       
   Network Infrastructure Monitor     
EOF
}

msg_info() {
  local msg="$1"
  echo -ne " ${HOLD} ${YW}${msg}..."
  spinner &
  SPINNER_PID=$!
}

msg_ok() {
  local msg="$1"
  kill $SPINNER_PID > /dev/null 2>&1
  echo -e "${BFR} ✓ ${GN}${msg}${CL}"
}

msg_error() {
  local msg="$1"
  kill $SPINNER_PID > /dev/null 2>&1
  echo -e "${BFR} ✗ ${RD}${msg}${CL}"
}

spinner() {
  local chars="/-\|"
  while :; do
    for (( i=0; i<${#chars}; i++ )); do
      sleep 0.1
      echo -en "${chars:$i:1}" "\b"
    done
  done
}

cleanup() {
  if [ -n "${SPINNER_PID-}" ] && ps -p $SPINNER_PID > /dev/null; then
    kill $SPINNER_PID > /dev/null 2>&1
  fi
  popd >/dev/null 2>&1 || true
}

function default_settings() {
  echo -e "${BL}[INFO]${CL} Using Default Settings"
  echo -e "${YW}Container Type: ${CL}Unprivileged"
  echo -e "${YW}Container ID: ${CL}Automatic"
  echo -e "${YW}Hostname: ${CL}nautilus"
  echo -e "${YW}Disk Size: ${CL}${var_disk}GB"
  echo -e "${YW}Allocated Cores: ${CL}${var_cpu}"
  echo -e "${YW}Allocated RAM: ${CL}${var_ram}MB"
  echo -e "${YW}Bridge: ${CL}vmbr0"
  echo -e "${YW}Static IP: ${CL}DHCP"
  echo -e "${YW}Gateway IP: ${CL}Default"
  echo -e "${YW}Disable IPv6: ${CL}No"
  echo -e "${YW}MTU Size: ${CL}Default"
  echo -e "${YW}DNS Search Domain: ${CL}Host"
  echo -e "${YW}DNS Server IP: ${CL}Host"
  echo -e "${YW}MAC Address: ${CL}Default"
  echo -e "${YW}VLAN Tag: ${CL}Default"
  echo -e "${YW}Enable Root SSH Access: ${CL}No"
  echo -e "${YW}Enable Verbose Mode: ${CL}No"
  read -p "Press enter to continue or ctrl+c to cancel..."
  
  # Set defaults
  CT_TYPE="1"
  PW=""
  CT_ID=""
  HN="nautilus"
  DISK_SIZE="$var_disk"
  CORE_COUNT="$var_cpu"
  RAM_SIZE="$var_ram"
  BRG="vmbr0"
  NET=""
  GATE=""
  APT_CACHER=""
  APT_CACHER_IP=""
  DISABLEIP6="no"
  MTU=""
  SD=""
  NS=""
  MAC=""
  VLAN=""
  SSH="no"
  VERB="no"
  echo_advanced
}

function advanced_settings() {
  echo -e "${BL}[INFO]${CL} Using Advanced Settings"
  
  # Container Type
  echo -e "${YW}Container Type${CL}"
  echo -e " ${YW}1)${CL} Unprivileged ${GN}(Recommended)${CL}"
  echo -e " ${YW}2)${CL} Privileged"
  while true; do
    read -p "Please choose a container type: " CT_TYPE1
    case $CT_TYPE1 in
      1 | "") CT_TYPE="1" && break ;;
      2) CT_TYPE="0" && break ;;
      *) echo -e "${RD}Invalid selection${CL}" ;;
    esac
  done
  
  # Container ID
  while true; do
    read -p "Enter the container ID (100-999): " CT_ID
    if [[ $CT_ID =~ ^[1-9][0-9]{2}$ ]]; then
      if pct status $CT_ID >/dev/null 2>&1; then
        echo -e "${RD}Container ID $CT_ID already exists${CL}"
      else
        break
      fi
    else
      echo -e "${RD}Invalid container ID (must be 100-999)${CL}"
    fi
  done
  
  # Hostname
  read -p "Enter the hostname (nautilus): " HN
  HN=${HN:-nautilus}
  
  # Disk Size
  while true; do
    read -p "Enter the disk size in GB (8): " DISK_SIZE
    DISK_SIZE=${DISK_SIZE:-8}
    if [[ $DISK_SIZE =~ $INTEGER ]]; then
      break
    else
      echo -e "${RD}Invalid disk size${CL}"
    fi
  done
  
  # CPU Cores
  while true; do
    read -p "Enter the number of CPU cores (2): " CORE_COUNT
    CORE_COUNT=${CORE_COUNT:-2}
    if [[ $CORE_COUNT =~ ^[1-9][0-9]*$ ]]; then
      break
    else
      echo -e "${RD}Invalid core count${CL}"
    fi
  done
  
  # RAM
  while true; do
    read -p "Enter the amount of RAM in MB (1024): " RAM_SIZE
    RAM_SIZE=${RAM_SIZE:-1024}
    if [[ $RAM_SIZE =~ ^[1-9][0-9]*$ ]]; then
      break
    else
      echo -e "${RD}Invalid RAM size${CL}"
    fi
  done
  
  # Bridge
  read -p "Enter the bridge (vmbr0): " BRG
  BRG=${BRG:-vmbr0}
  
  # Network Configuration
  echo -e "${YW}Network Configuration${CL}"
  echo -e " ${YW}1)${CL} DHCP ${GN}(Recommended)${CL}"
  echo -e " ${YW}2)${CL} Static IP"
  while true; do
    read -p "Please choose: " NET_TYPE
    case $NET_TYPE in
      1 | "") NET="dhcp" && break ;;
      2) 
        read -p "Enter the static IP (CIDR format): " NET
        read -p "Enter the gateway IP: " GATE
        break ;;
      *) echo -e "${RD}Invalid selection${CL}" ;;
    esac
  done
  
  # SSH Access
  echo -e "${YW}Enable Root SSH Access${CL}"
  echo -e " ${YW}1)${CL} No ${GN}(Recommended)${CL}"
  echo -e " ${YW}2)${CL} Yes"
  while true; do
    read -p "Please choose: " SSH_CHOICE
    case $SSH_CHOICE in
      1 | "") SSH="no" && break ;;
      2) SSH="yes" && break ;;
      *) echo -e "${RD}Invalid selection${CL}" ;;
    esac
  done
  
  # Set remaining defaults
  PW=""
  APT_CACHER=""
  APT_CACHER_IP=""
  DISABLEIP6="no"
  MTU=""
  SD=""
  NS=""
  MAC=""
  VLAN=""
  VERB="no"
  
  echo_advanced
}

function echo_advanced() {
  if [[ "$CT_TYPE" == "1" ]]; then
    FEATURES="nesting=1"
  else
    FEATURES="nesting=1"
  fi
  
  if [[ "$SSH" == "yes" ]]; then
    FEATURES="$FEATURES,keyctl=1"
  fi
  
  TEMP_DIR=$(mktemp -d)
  pushd $TEMP_DIR >/dev/null
  
  if [[ -z "$CT_ID" ]]; then
    CT_ID=$(pvesh get /cluster/nextid)
  fi
  
  echo -e "${BL}[INFO]${CL} Container will be created with ID: ${GN}$CT_ID${CL}"
}

function install_script() {
  STORAGE_TYPE=$(pvesm status -storage $(pvesm status | awk 'NR>1{print $1}' | head -1) | awk 'NR>1{print $2}')
  if [ "$STORAGE_TYPE" = "dir" ]; then
    STORAGE=$(pvesm status | awk 'NR>1{print $1}' | head -1)
    ROOTFS="$STORAGE:$DISK_SIZE"
  else
    STORAGE=$(pvesm status | awk 'NR>1{print $1}' | head -1)
    ROOTFS="$STORAGE:$DISK_SIZE"
  fi
  
  msg_info "Validating Storage"
  if ! pvesm status -storage $STORAGE >/dev/null 2>&1; then
    msg_error "Storage $STORAGE not found"
    exit 1
  fi
  msg_ok "Storage $STORAGE validated"
  
  msg_info "Downloading Ubuntu Template"
  if [[ ! -f /var/lib/vz/template/cache/ubuntu-22.04-standard_22.04-1_amd64.tar.zst ]]; then
    if ! pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst >/dev/null 2>&1; then
      msg_error "Template download failed"
      exit 1
    fi
  fi
  msg_ok "Template available"
  
  msg_info "Creating LXC Container"
  
  # Build network configuration
  if [[ "$NET" == "dhcp" ]]; then
    NET_CONFIG="name=eth0,bridge=$BRG,ip=dhcp"
  else
    NET_CONFIG="name=eth0,bridge=$BRG,ip=$NET"
    if [[ -n "$GATE" ]]; then
      NET_CONFIG="$NET_CONFIG,gw=$GATE"
    fi
  fi
  
  if ! pct create $CT_ID /var/lib/vz/template/cache/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
    --arch amd64 \
    --cores $CORE_COUNT \
    --hostname $HN \
    --memory $RAM_SIZE \
    --net0 $NET_CONFIG \
    --onboot 1 \
    --ostype ubuntu \
    --rootfs $ROOTFS \
    --swap 512 \
    --timezone $timezone \
    --unprivileged $CT_TYPE \
    --features $FEATURES >/dev/null 2>&1; then
    msg_error "Container creation failed"
    exit 1
  fi
  msg_ok "LXC Container $CT_ID Created"
  
  msg_info "Starting LXC Container"
  if ! pct start $CT_ID >/dev/null 2>&1; then
    msg_error "Container start failed"
    exit 1
  fi
  msg_ok "Container Started"
  
  msg_info "Setting up Container OS"
  if ! pct exec $CT_ID -- bash -c "apt update && apt upgrade -y" >/dev/null 2>&1; then
    msg_error "OS setup failed"
    exit 1
  fi
  msg_ok "Updated Container OS"
  
  msg_info "Installing Node.js Repository"
  if ! pct exec $CT_ID -- bash -c "curl -fsSL https://deb.nodesource.com/setup_18.x | bash -" >/dev/null 2>&1; then
    msg_error "Node.js repository installation failed"
    exit 1
  fi
  msg_ok "Node.js Repository Added"
  
  msg_info "Installing Dependencies"
  if ! pct exec $CT_ID -- bash -c "apt install -y nodejs git nginx curl" >/dev/null 2>&1; then
    msg_error "Dependencies installation failed"
    exit 1
  fi
  msg_ok "Dependencies Installed"
  
  msg_info "Creating Nautilus User"
  if ! pct exec $CT_ID -- bash -c "
    useradd -m -s /bin/bash nautilus
    mkdir -p /opt/nautilus
    chown nautilus:nautilus /opt/nautilus
  " >/dev/null 2>&1; then
    msg_error "User creation failed"
    exit 1
  fi
  msg_ok "Nautilus User Created"
  
  msg_info "Downloading and Building Nautilus"
  if ! pct exec $CT_ID -- bash -c "
    su - nautilus -c '
      cd /opt/nautilus
      git clone https://github.com/voenkogel/Nautilus.git .
      npm install --production
      npm run build
      mkdir -p data
      echo \"{}\" > data/config.json
    '
  " >/dev/null 2>&1; then
    msg_error "Nautilus installation failed"
    exit 1
  fi
  msg_ok "Nautilus Downloaded and Built"
  
  msg_info "Creating Systemd Service"
  if ! pct exec $CT_ID -- bash -c "cat > /etc/systemd/system/nautilus.service << 'EOF'
[Unit]
Description=Nautilus Network Monitor
After=network.target

[Service]
Type=simple
User=nautilus
WorkingDirectory=/opt/nautilus
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3069

[Install]
WantedBy=multi-user.target
EOF" >/dev/null 2>&1; then
    msg_error "Service creation failed"
    exit 1
  fi
  msg_ok "Systemd Service Created"
  
  msg_info "Configuring Nginx Reverse Proxy"
  if ! pct exec $CT_ID -- bash -c "cat > /etc/nginx/sites-available/default << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    client_max_body_size 10M;
    
    location / {
        proxy_pass http://localhost:3069;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF" >/dev/null 2>&1; then
    msg_error "Nginx configuration failed"
    exit 1
  fi
  msg_ok "Nginx Configured"
  
  msg_info "Starting Services"
  if ! pct exec $CT_ID -- bash -c "
    systemctl daemon-reload
    systemctl enable nautilus nginx
    systemctl start nautilus nginx
  " >/dev/null 2>&1; then
    msg_error "Service startup failed"
    exit 1
  fi
  msg_ok "Services Started"
  
  msg_info "Setting up Firewall Rules"
  if ! pct exec $CT_ID -- bash -c "
    ufw --force enable
    ufw allow 80/tcp
    ufw allow ssh
  " >/dev/null 2>&1; then
    msg_error "Firewall setup failed"
    exit 1
  fi
  msg_ok "Firewall Configured"
  
  # Get container IP
  msg_info "Getting Container IP"
  sleep 5
  IP=$(pct exec $CT_ID -- hostname -I 2>/dev/null | awk '{print $1}' || echo "IP not available")
  if [[ "$IP" == "IP not available" ]]; then
    IP=$(pct config $CT_ID | grep -E "net0:" | grep -oP "ip=\K[^,/]+" || echo "Check container network")
  fi
  msg_ok "Container Network Ready"
  
  header_info
  echo
  echo -e " ${GN}Installation Completed Successfully!${CL}"
  echo
  echo -e " ${BL}Container Information:${CL}"
  echo -e " ${YW}Container ID: ${CL}$CT_ID"
  echo -e " ${YW}Hostname: ${CL}$HN"
  echo -e " ${YW}IP Address: ${CL}$IP"
  echo
  echo -e " ${BL}Access Information:${CL}"
  echo -e " ${YW}Web Interface: ${CL}${GN}http://$IP${CL}"
  echo -e " ${YW}SSH Access: ${CL}ssh root@$IP"
  echo
  echo -e " ${BL}Service Management:${CL}"
  echo -e " ${YW}Start: ${CL}pct exec $CT_ID -- systemctl start nautilus"
  echo -e " ${YW}Stop: ${CL}pct exec $CT_ID -- systemctl stop nautilus"
  echo -e " ${YW}Restart: ${CL}pct exec $CT_ID -- systemctl restart nautilus"
  echo -e " ${YW}Status: ${CL}pct exec $CT_ID -- systemctl status nautilus"
  echo
  echo -e " ${BL}Update Nautilus:${CL}"
  echo -e " ${YW}Command: ${CL}pct exec $CT_ID -- su - nautilus -c 'cd /opt/nautilus && git pull && npm run build && sudo systemctl restart nautilus'"
  echo
  echo -e " ${GN}Enjoy your new Nautilus Network Monitor!${CL}"
  echo
}

# Validation functions
function check_root() {
  if [[ $EUID -ne 0 ]]; then
    echo -e "${RD}This script must be run as root${CL}"
    exit 1
  fi
}

function check_proxmox() {
  if ! command -v pct >/dev/null 2>&1; then
    echo -e "${RD}This script must be run on a Proxmox VE host${CL}"
    exit 1
  fi
  
  if ! systemctl is-active --quiet pvedaemon; then
    echo -e "${RD}Proxmox VE services are not running${CL}"
    exit 1
  fi
}

function check_internet() {
  if ! ping -c 1 github.com >/dev/null 2>&1; then
    echo -e "${RD}Internet connection is required for installation${CL}"
    exit 1
  fi
}

# Main script execution
header_info
echo
echo -e " Welcome to the ${GN}Nautilus${CL} LXC Container Installer!"
echo -e " This script will create a ready-to-use Nautilus installation."
echo
echo -e " ${YW}⚠️  Requirements:${CL}"
echo -e "   • Proxmox VE 6.2 or later"
echo -e "   • Internet connection"
echo -e "   • Sufficient storage space (8GB minimum)"
echo
echo -e " ${BL}What will be installed:${CL}"
echo -e "   • Ubuntu 22.04 LXC Container"
echo -e "   • Node.js 18.x runtime"
echo -e "   • Nautilus Network Monitor"
echo -e "   • Nginx reverse proxy"
echo -e "   • Systemd services"
echo

# Run validation checks
check_root
check_proxmox
check_internet

echo -e "${GN}✓${CL} All requirements met!"
echo

# Settings selection
echo -e "${YW}Select a setup method:${CL}"
echo -e " ${YW}1)${CL} Default Settings ${GN}(Recommended)${CL}"
echo -e " ${YW}2)${CL} Advanced Settings"
echo

while true; do
  read -p "Please choose [1-2]: " -n 1 -r
  echo
  case $REPLY in
    1 | "") default_settings && break ;;
    2) advanced_settings && break ;;
    *) echo -e "${RD}Invalid selection. Please choose 1 or 2.${CL}" ;;
  esac
done

# Start installation
install_script

cleanup
exit 0
