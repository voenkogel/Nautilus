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

# Enhanced logging functions
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

msg_warn() {
  local msg="$1"
  echo -e " ${YW}⚠️  WARNING: ${msg}${CL}"
}

msg_debug() {
  local msg="$1"
  if [ "${VERBOSE:-}" = "yes" ]; then
    echo -e " ${BL}🔍 DEBUG: ${msg}${CL}"
  fi
}

msg_detail() {
  local msg="$1"
  echo -e "   ${BL}→ ${msg}${CL}"
}

# System diagnostics function
run_diagnostics() {
  echo ""
  echo -e "${BL}========================================${CL}"
  echo -e "${BL}           SYSTEM DIAGNOSTICS           ${CL}"
  echo -e "${BL}========================================${CL}"
  
  # Check Proxmox version
  echo -e "${YW}Proxmox VE Version:${CL}"
  if command -v pveversion >/dev/null 2>&1; then
    pveversion | head -1
  else
    echo -e "${RD}  ERROR: pveversion command not found${CL}"
    return 1
  fi
  
  # Check available container IDs
  echo -e "\n${YW}Container ID Information:${CL}"
  if command -v pvesh >/dev/null 2>&1; then
    local next_id=$(pvesh get /cluster/nextid 2>/dev/null || echo "ERROR")
    if [ "$next_id" != "ERROR" ]; then
      echo -e "  Next available ID: ${GN}$next_id${CL}"
      CT_ID=${next_id}
    else
      echo -e "${RD}  ERROR: Cannot determine next available ID${CL}"
      return 1
    fi
  else
    echo -e "${RD}  ERROR: pvesh command not found${CL}"
    return 1
  fi
  
  # Check if proposed ID is available
  if [ -n "${CT_ID:-}" ]; then
    if pct config $CT_ID >/dev/null 2>&1; then
      echo -e "${RD}  ERROR: Container ID $CT_ID is already in use${CL}"
      return 1
    else
      echo -e "  Container ID $CT_ID: ${GN}Available${CL}"
    fi
  fi
  
  # Check storage
  echo -e "\n${YW}Storage Information:${CL}"
  if command -v pvesm >/dev/null 2>&1; then
    local storage_info=$(pvesm status | grep -E "^local" || echo "")
    if [ -n "$storage_info" ]; then
      echo -e "  Storage status:"
      echo "    $storage_info" | while read line; do
        echo "    $line"
      done
      
      # Check available space
      local avail_gb=$(pvesm status | awk '/^local/ {print $4}' | head -1)
      if [ -n "$avail_gb" ] && [ "$avail_gb" -gt 0 ]; then
        local avail_human=$(numfmt --to=iec --from-unit=1048576 $avail_gb 2>/dev/null || echo "${avail_gb}MB")
        echo -e "  Available space: ${GN}${avail_human}${CL}"
        
        local required_mb=$((var_disk * 1024))
        if [ "$avail_gb" -lt "$required_mb" ]; then
          echo -e "${RD}  ERROR: Insufficient storage space${CL}"
          echo -e "    Required: ${var_disk}GB, Available: ${avail_human}"
          return 1
        else
          echo -e "  Space check: ${GN}OK (${var_disk}GB required)${CL}"
        fi
      else
        echo -e "${YW}  WARNING: Could not determine available space${CL}"
      fi
    else
      echo -e "${RD}  ERROR: Local storage not found${CL}"
      return 1
    fi
  else
    echo -e "${RD}  ERROR: pvesm command not found${CL}"
    return 1
  fi
  
  # Check templates
  echo -e "\n${YW}Template Information:${CL}"
  if command -v pveam >/dev/null 2>&1; then
    local template_file="ubuntu-${var_version}-standard_${var_version}-1_amd64.tar.zst"
    local template_path="/var/lib/vz/template/cache/$template_file"
    
    if [ -f "$template_path" ]; then
      echo -e "  Template: ${GN}Found${CL}"
      echo -e "    Path: $template_path"
      local size=$(du -h "$template_path" 2>/dev/null | cut -f1 || echo "unknown")
      echo -e "    Size: $size"
    else
      echo -e "  Template: ${YW}Not found locally${CL}"
      echo -e "    Will attempt to download: $template_file"
      
      # Check if we can list available templates
      local available=$(pveam available | grep "ubuntu-${var_version}-standard" | head -1 || echo "")
      if [ -n "$available" ]; then
        echo -e "    Available for download: ${GN}Yes${CL}"
      else
        echo -e "${RD}    ERROR: Template not available for download${CL}"
        return 1
      fi
    fi
  else
    echo -e "${RD}  ERROR: pveam command not found${CL}"
    return 1
  fi
  
  # Check network bridges
  echo -e "\n${YW}Network Information:${CL}"
  local bridge="${var_bridge:-vmbr0}"
  if ip link show "$bridge" >/dev/null 2>&1; then
    echo -e "  Bridge $bridge: ${GN}Available${CL}"
    local bridge_state=$(ip link show "$bridge" | grep -o "state [A-Z]*" | awk '{print $2}')
    echo -e "    State: $bridge_state"
  else
    echo -e "${RD}  ERROR: Bridge $bridge not found${CL}"
    echo -e "    Available bridges:"
    ip link show | grep -E "^[0-9]+: [a-zA-Z0-9]+.*:" | grep -E "(vmbr|bridge)" | while read line; do
      local bridge_name=$(echo "$line" | cut -d: -f2 | xargs)
      echo -e "      $bridge_name"
    done
    return 1
  fi
  
  # Check internet connectivity
  echo -e "\n${YW}Connectivity Check:${CL}"
  if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
    echo -e "  Internet: ${GN}Connected${CL}"
    if ping -c 1 github.com >/dev/null 2>&1; then
      echo -e "  GitHub: ${GN}Reachable${CL}"
    else
      echo -e "${YW}  WARNING: GitHub not reachable (DNS issue?)${CL}"
    fi
  else
    echo -e "${RD}  ERROR: No internet connectivity${CL}"
    return 1
  fi
  
  # Memory check
  echo -e "\n${YW}Memory Information:${CL}"
  local total_mem=$(free -m | awk '/^Mem:/ {print $2}')
  local available_mem=$(free -m | awk '/^Mem:/ {print $7}')
  echo -e "  Total RAM: ${total_mem}MB"
  echo -e "  Available RAM: ${available_mem}MB"
  echo -e "  Required for container: ${var_ram}MB"
  
  if [ "$available_mem" -gt "$var_ram" ]; then
    echo -e "  Memory check: ${GN}OK${CL}"
  else
    echo -e "${YW}  WARNING: Low available memory${CL}"
  fi
  
  echo -e "\n${BL}========================================${CL}"
  echo -e "${GN}All diagnostics completed!${CL}"
  echo -e "${BL}========================================${CL}"
  echo ""
  
  return 0
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
  msg_detail "Container ID: $CT_ID"
  msg_detail "Hostname: $HN"
  msg_detail "CPU Cores: $CORE_COUNT"
  msg_detail "Memory: ${RAM_SIZE}MB"
  msg_detail "Disk: $ROOTFS"
  msg_detail "Bridge: $BRG"
  
  # Build network configuration
  if [[ "$NET" == "dhcp" ]]; then
    NET_CONFIG="name=eth0,bridge=$BRG,ip=dhcp"
    msg_detail "Network: DHCP on $BRG"
  else
    NET_CONFIG="name=eth0,bridge=$BRG,ip=$NET"
    if [[ -n "$GATE" ]]; then
      NET_CONFIG="$NET_CONFIG,gw=$GATE"
      msg_detail "Network: $NET via $GATE on $BRG"
    else
      msg_detail "Network: $NET on $BRG"
    fi
  fi
  
  # Show full pct create command if verbose
  msg_debug "Container creation command:"
  msg_debug "pct create $CT_ID /var/lib/vz/template/cache/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \\"
  msg_debug "  --arch amd64 \\"
  msg_debug "  --cores $CORE_COUNT \\"
  msg_debug "  --hostname $HN \\"
  msg_debug "  --memory $RAM_SIZE \\"
  msg_debug "  --net0 $NET_CONFIG \\"
  msg_debug "  --onboot 1 \\"
  msg_debug "  --ostype ubuntu \\"
  msg_debug "  --rootfs $ROOTFS \\"
  msg_debug "  --swap 512 \\"
  msg_debug "  --timezone $timezone \\"
  msg_debug "  --unprivileged $CT_TYPE \\"
  msg_debug "  --features $FEATURES"
  
  # Attempt container creation with detailed error handling
  local create_output
  local create_error
  create_output=$(pct create $CT_ID /var/lib/vz/template/cache/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
    --arch amd64 \
    --cores $CORE_COUNT \
    --hostname $HN \
    --memory $RAM_SIZE \
    --net0 "$NET_CONFIG" \
    --onboot 1 \
    --ostype ubuntu \
    --rootfs $ROOTFS \
    --swap 512 \
    --timezone $timezone \
    --unprivileged $CT_TYPE \
    --features $FEATURES 2>&1)
  create_error=$?
  
  if [ $create_error -ne 0 ]; then
    msg_error "Container creation failed"
    echo ""
    echo -e "${RD}========================================${CL}"
    echo -e "${RD}         CONTAINER CREATION ERROR       ${CL}"
    echo -e "${RD}========================================${CL}"
    echo -e "${YW}Exit Code:${CL} $create_error"
    echo -e "${YW}Error Output:${CL}"
    echo "$create_output" | while IFS= read -r line; do
      echo -e "  ${RD}$line${CL}"
    done
    echo ""
    echo -e "${YW}Common Solutions:${CL}"
    echo -e "  1. Try a different container ID:"
    echo -e "     ${BL}curl -s [SCRIPT_URL] | bash -s 200${CL}"
    echo ""
    echo -e "  2. Check if ID $CT_ID is already in use:"
    echo -e "     ${BL}pct list | grep $CT_ID${CL}"
    echo ""
    echo -e "  3. Check storage space:"
    echo -e "     ${BL}pvesm status${CL}"
    echo ""
    echo -e "  4. Verify bridge exists:"
    echo -e "     ${BL}ip link show $BRG${CL}"
    echo ""
    echo -e "  5. Check template integrity:"
    echo -e "     ${BL}ls -la /var/lib/vz/template/cache/ubuntu-22.04*${CL}"
    echo ""
    echo -e "${RD}========================================${CL}"
    exit 1
  fi
  
  msg_ok "LXC Container $CT_ID Created"
  msg_detail "Creation output: $create_output"
  
  msg_info "Starting LXC Container"
  msg_detail "Command: pct start $CT_ID"
  
  local start_output
  local start_error
  start_output=$(pct start $CT_ID 2>&1)
  start_error=$?
  
  if [ $start_error -ne 0 ]; then
    msg_error "Container start failed"
    echo ""
    echo -e "${RD}========================================${CL}"
    echo -e "${RD}         CONTAINER START ERROR          ${CL}"
    echo -e "${RD}========================================${CL}"
    echo -e "${YW}Exit Code:${CL} $start_error"
    echo -e "${YW}Error Output:${CL}"
    echo "$start_output" | while IFS= read -r line; do
      echo -e "  ${RD}$line${CL}"
    done
    echo ""
    echo -e "${YW}Troubleshooting:${CL}"
    echo -e "  1. Check container configuration:"
    echo -e "     ${BL}pct config $CT_ID${CL}"
    echo ""
    echo -e "  2. Check system resources:"
    echo -e "     ${BL}free -m && df -h${CL}"
    echo ""
    echo -e "  3. Try manual start with debug:"
    echo -e "     ${BL}pct start $CT_ID --debug${CL}"
    echo ""
    echo -e "  4. Check container logs:"
    echo -e "     ${BL}journalctl -u pve-container@$CT_ID${CL}"
    echo ""
    echo -e "${RD}========================================${CL}"
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
  msg_detail "Repository: https://github.com/voenkogel/Nautilus.git"
  msg_detail "Installation directory: /opt/nautilus"
  msg_detail "Running as user: nautilus"
  
  local install_output
  local install_error
  install_output=$(pct exec $CT_ID -- bash -c "
    su - nautilus -c '
      cd /opt/nautilus
      echo \"=== Cloning repository ===\" 
      git clone https://github.com/voenkogel/Nautilus.git . 2>&1
      echo \"=== Installing dependencies ===\" 
      npm install --production 2>&1
      echo \"=== Building application ===\" 
      npm run build 2>&1
      echo \"=== Creating data directory ===\" 
      mkdir -p data
      echo \"{}\" > data/config.json
      echo \"=== Installation complete ===\" 
    '
  " 2>&1)
  install_error=$?
  
  if [ $install_error -ne 0 ]; then
    msg_error "Nautilus installation failed"
    echo ""
    echo -e "${RD}========================================${CL}"
    echo -e "${RD}       NAUTILUS INSTALLATION ERROR      ${CL}"
    echo -e "${RD}========================================${CL}"
    echo -e "${YW}Exit Code:${CL} $install_error"
    echo -e "${YW}Installation Output:${CL}"
    echo "$install_output" | while IFS= read -r line; do
      echo -e "  ${RD}$line${CL}"
    done
    echo ""
    echo -e "${YW}Common Solutions:${CL}"
    echo -e "  1. Check internet connectivity in container:"
    echo -e "     ${BL}pct exec $CT_ID -- ping -c 3 github.com${CL}"
    echo ""
    echo -e "  2. Check container disk space:"
    echo -e "     ${BL}pct exec $CT_ID -- df -h${CL}"
    echo ""
    echo -e "  3. Manually retry installation:"
    echo -e "     ${BL}pct enter $CT_ID${CL}"
    echo -e "     ${BL}su - nautilus${CL}"
    echo -e "     ${BL}cd /opt/nautilus && git clone https://github.com/voenkogel/Nautilus.git .${CL}"
    echo ""
    echo -e "  4. Check Node.js installation:"
    echo -e "     ${BL}pct exec $CT_ID -- node --version${CL}"
    echo -e "     ${BL}pct exec $CT_ID -- npm --version${CL}"
    echo ""
    echo -e "${RD}========================================${CL}"
    exit 1
  fi
  
  msg_ok "Nautilus Downloaded and Built"
  msg_debug "Installation output:"
  if [ "${VERBOSE:-}" = "yes" ]; then
    echo "$install_output" | while IFS= read -r line; do
      msg_debug "$line"
    done
  fi
  
  msg_info "Creating Systemd Service"
  msg_detail "Service name: nautilus.service"
  msg_detail "Service user: nautilus"
  msg_detail "Working directory: /opt/nautilus"
  msg_detail "Service port: 3069"
  
  local service_output
  local service_error
  service_output=$(pct exec $CT_ID -- bash -c "
    echo \"=== Creating systemd service file ===\" 
    cat > /etc/systemd/system/nautilus.service << 'EOF'
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
EOF
    echo \"=== Reloading systemd daemon ===\" 
    systemctl daemon-reload 2>&1
    echo \"=== Enabling nautilus service ===\" 
    systemctl enable nautilus 2>&1
    echo \"=== Starting nautilus service ===\" 
    systemctl start nautilus 2>&1
    echo \"=== Checking service status ===\" 
    systemctl is-active nautilus 2>&1
    systemctl status nautilus --no-pager -l 2>&1 || true
  " 2>&1)
  service_error=$?
  
  if [ $service_error -ne 0 ]; then
    msg_error "Systemd service configuration failed"
    echo ""
    echo -e "${RD}========================================${CL}"
    echo -e "${RD}        SYSTEMD SERVICE ERROR           ${CL}"
    echo -e "${RD}========================================${CL}"
    echo -e "${YW}Exit Code:${CL} $service_error"
    echo -e "${YW}Service Configuration Output:${CL}"
    echo "$service_output" | while IFS= read -r line; do
      echo -e "  ${RD}$line${CL}"
    done
    echo ""
    echo -e "${YW}Common Solutions:${CL}"
    echo -e "  1. Check service status manually:"
    echo -e "     ${BL}pct exec $CT_ID -- systemctl status nautilus${CL}"
    echo ""
    echo -e "  2. Check service logs:"
    echo -e "     ${BL}pct exec $CT_ID -- journalctl -u nautilus -n 50${CL}"
    echo ""
    echo -e "  3. Verify file permissions:"
    echo -e "     ${BL}pct exec $CT_ID -- ls -la /opt/nautilus${CL}"
    echo -e "     ${BL}pct exec $CT_ID -- ls -la /etc/systemd/system/nautilus.service${CL}"
    echo ""
    echo -e "  4. Test manual startup:"
    echo -e "     ${BL}pct exec $CT_ID -- su - nautilus -c \"cd /opt/nautilus && node server/index.js\"${CL}"
    echo ""
    echo -e "${RD}========================================${CL}"
    exit 1
  fi
  msg_ok "Systemd Service Created"
  
  msg_info "Configuring Nginx Reverse Proxy"
  msg_detail "Proxy target: http://localhost:3069"
  msg_detail "Configuration file: /etc/nginx/sites-available/default"
  msg_detail "Client max body size: 10M"
  
  local nginx_output
  local nginx_error
  nginx_output=$(pct exec $CT_ID -- bash -c "
    echo \"=== Creating nginx configuration ===\" 
    cat > /etc/nginx/sites-available/default << 'EOF'
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
EOF
    echo \"=== Testing nginx configuration ===\" 
    nginx -t 2>&1
  " 2>&1)
  nginx_error=$?
  
  if [ $nginx_error -ne 0 ]; then
    msg_error "Nginx configuration failed"
    echo ""
    echo -e "${RD}========================================${CL}"
    echo -e "${RD}        NGINX CONFIGURATION ERROR       ${CL}"
    echo -e "${RD}========================================${CL}"
    echo -e "${YW}Exit Code:${CL} $nginx_error"
    echo -e "${YW}Nginx Configuration Output:${CL}"
    echo "$nginx_output" | while IFS= read -r line; do
      echo -e "  ${RD}$line${CL}"
    done
    echo ""
    echo -e "${YW}Common Solutions:${CL}"
    echo -e "  1. Test nginx configuration:"
    echo -e "     ${BL}pct exec $CT_ID -- nginx -t${CL}"
    echo ""
    echo -e "  2. Check nginx error log:"
    echo -e "     ${BL}pct exec $CT_ID -- tail -n 20 /var/log/nginx/error.log${CL}"
    echo ""
    echo -e "  3. Verify configuration file syntax:"
    echo -e "     ${BL}pct exec $CT_ID -- cat /etc/nginx/sites-available/default${CL}"
    echo ""
    echo -e "  4. Check nginx installation:"
    echo -e "     ${BL}pct exec $CT_ID -- nginx -v${CL}"
    echo ""
    echo -e "${RD}========================================${CL}"
    exit 1
  fi
  msg_ok "Nginx Configured"
  
  msg_info "Starting Services"
  msg_detail "Enabling services: nautilus, nginx"
  msg_detail "Starting services: nautilus, nginx"
  
  local service_start_output
  local service_start_error
  service_start_output=$(pct exec $CT_ID -- bash -c "
    echo \"=== Reloading systemd daemon ===\" 
    systemctl daemon-reload 2>&1
    echo \"=== Enabling services ===\" 
    systemctl enable nautilus 2>&1
    systemctl enable nginx 2>&1
    echo \"=== Starting nautilus service ===\" 
    systemctl start nautilus 2>&1
    echo \"=== Starting nginx service ===\" 
    systemctl start nginx 2>&1
    echo \"=== Checking service status ===\" 
    systemctl is-active nautilus 2>&1
    systemctl is-active nginx 2>&1
    echo \"=== Service status details ===\" 
    systemctl status nautilus --no-pager -l 2>&1 || true
    systemctl status nginx --no-pager -l 2>&1 || true
  " 2>&1)
  service_start_error=$?
  
  if [ $service_start_error -ne 0 ]; then
    msg_error "Service startup failed"
    echo ""
    echo -e "${RD}========================================${CL}"
    echo -e "${RD}        SERVICE STARTUP ERROR           ${CL}"
    echo -e "${RD}========================================${CL}"
    echo -e "${YW}Exit Code:${CL} $service_start_error"
    echo -e "${YW}Service Startup Output:${CL}"
    echo "$service_start_output" | while IFS= read -r line; do
      echo -e "  ${RD}$line${CL}"
    done
    echo ""
    echo -e "${YW}Common Solutions:${CL}"
    echo -e "  1. Check individual service status:"
    echo -e "     ${BL}pct exec $CT_ID -- systemctl status nautilus${CL}"
    echo -e "     ${BL}pct exec $CT_ID -- systemctl status nginx${CL}"
    echo ""
    echo -e "  2. Check service logs:"
    echo -e "     ${BL}pct exec $CT_ID -- journalctl -u nautilus -n 20${CL}"
    echo -e "     ${BL}pct exec $CT_ID -- journalctl -u nginx -n 20${CL}"
    echo ""
    echo -e "  3. Check port conflicts:"
    echo -e "     ${BL}pct exec $CT_ID -- ss -tlnp | grep -E ':(80|3069)'${CL}"
    echo ""
    echo -e "  4. Test services manually:"
    echo -e "     ${BL}pct exec $CT_ID -- su - nautilus -c \"cd /opt/nautilus && node server/index.js\"${CL}"
    echo ""
    echo -e "${RD}========================================${CL}"
    exit 1
  fi
  msg_ok "Services Started"
  
  msg_debug "Service startup output:"
  if [ "${VERBOSE:-}" = "yes" ]; then
    echo "$service_start_output" | while IFS= read -r line; do
      msg_debug "$line"
    done
  fi
  
  msg_info "Setting up Firewall Rules"
  msg_detail "Enabling UFW firewall"
  msg_detail "Allowing ports: 80/tcp (HTTP), 22/tcp (SSH)"
  
  local firewall_output
  local firewall_error
  firewall_output=$(pct exec $CT_ID -- bash -c "
    echo \"=== Enabling UFW firewall ===\" 
    ufw --force enable 2>&1
    echo \"=== Adding HTTP rule ===\" 
    ufw allow 80/tcp 2>&1
    echo \"=== Adding SSH rule ===\" 
    ufw allow ssh 2>&1
    echo \"=== Checking firewall status ===\" 
    ufw status 2>&1
  " 2>&1)
  firewall_error=$?
  
  if [ $firewall_error -ne 0 ]; then
    msg_error "Firewall setup failed"
    echo ""
    echo -e "${RD}========================================${CL}"
    echo -e "${RD}        FIREWALL CONFIGURATION ERROR    ${CL}"
    echo -e "${RD}========================================${CL}"
    echo -e "${YW}Exit Code:${CL} $firewall_error"
    echo -e "${YW}Firewall Configuration Output:${CL}"
    echo "$firewall_output" | while IFS= read -r line; do
      echo -e "  ${RD}$line${CL}"
    done
    echo ""
    echo -e "${YW}Common Solutions:${CL}"
    echo -e "  1. Check UFW installation:"
    echo -e "     ${BL}pct exec $CT_ID -- ufw --version${CL}"
    echo ""
    echo -e "  2. Check firewall status:"
    echo -e "     ${BL}pct exec $CT_ID -- ufw status verbose${CL}"
    echo ""
    echo -e "  3. Manual firewall setup:"
    echo -e "     ${BL}pct exec $CT_ID -- ufw --force enable${CL}"
    echo -e "     ${BL}pct exec $CT_ID -- ufw allow 80/tcp${CL}"
    echo ""
    echo -e "  4. Alternative: Use iptables directly:"
    echo -e "     ${BL}pct exec $CT_ID -- iptables -A INPUT -p tcp --dport 80 -j ACCEPT${CL}"
    echo ""
    echo -e "${RD}========================================${CL}"
    exit 1
  fi
  msg_ok "Firewall Configured"
  
  msg_debug "Firewall configuration output:"
  if [ "${VERBOSE:-}" = "yes" ]; then
    echo "$firewall_output" | while IFS= read -r line; do
      msg_debug "$line"
    done
  fi
  
  # Get container IP
  msg_info "Getting Container IP"
  msg_detail "Waiting for network initialization..."
  sleep 5
  
  local ip_output
  IP=$(pct exec $CT_ID -- hostname -I 2>/dev/null | awk '{print $1}' || echo "")
  if [[ -z "$IP" ]]; then
    msg_detail "Trying alternative IP detection method..."
    IP=$(pct config $CT_ID | grep -E "net0:" | grep -oP "ip=\K[^,/]+" 2>/dev/null || echo "")
  fi
  
  if [[ -z "$IP" ]]; then
    msg_detail "Using container exec to get IP..."
    IP=$(pct exec $CT_ID -- ip route get 1 2>/dev/null | grep -oP 'src \K\S+' || echo "Check container network")
  fi
  
  if [[ "$IP" == "Check container network" ]]; then
    msg_warn "Could not automatically detect container IP"
    msg_detail "Manual IP check: pct exec $CT_ID -- ip addr show"
  else
    msg_detail "Detected IP address: $IP"
  fi
  msg_ok "Container Network Ready"
  
  # Final verification
  msg_info "Running Final Verification"
  msg_detail "Testing service connectivity..."
  
  local verification_output
  verification_output=$(pct exec $CT_ID -- bash -c "
    echo \"=== Service Status Check ===\" 
    systemctl is-active nautilus 2>&1
    systemctl is-active nginx 2>&1
    echo \"=== Port Listening Check ===\" 
    ss -tlnp | grep -E ':(80|3069)' 2>&1 || echo 'No services listening on expected ports'
    echo \"=== Web Service Test ===\" 
    curl -s -o /dev/null -w '%{http_code}' http://localhost 2>&1 || echo 'HTTP request failed'
    echo \"=== Disk Space Check ===\" 
    df -h / | tail -1 2>&1
    echo \"=== Memory Usage Check ===\" 
    free -h 2>&1
  " 2>&1)
  
  msg_debug "Final verification output:"
  if [ "${VERBOSE:-}" = "yes" ]; then
    echo "$verification_output" | while IFS= read -r line; do
      msg_debug "$line"
    done
  fi
  
  msg_ok "Final Verification Complete"
  
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

# Add verbose mode option
if [ "${1:-}" = "--verbose" ] || [ "${1:-}" = "-v" ]; then
  VERBOSE="yes"
  echo -e "${BL}Verbose mode enabled - detailed diagnostics will be shown${CL}"
  echo ""
fi

# Run comprehensive diagnostics
echo -e "${BL}Running system diagnostics...${CL}"
if ! run_diagnostics; then
  echo ""
  echo -e "${RD}❌ System diagnostics failed!${CL}"
  echo -e "${YW}Please resolve the issues above and try again.${CL}"
  echo ""
  echo -e "${BL}For help, visit: https://github.com/voenkogel/Nautilus/issues${CL}"
  exit 1
fi

echo -e "${GN}✓ System diagnostics passed!${CL}"
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
