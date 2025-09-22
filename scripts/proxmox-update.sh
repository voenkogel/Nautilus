#!/usr/bin/env bash

# Nautilus Update Script for Proxmox LXC
# Updates an existing Nautilus installation

set -Eeuo pipefail

# Colors
RD='\033[01;31m'
YW='\033[33m'
GN='\033[1;92m'
BL='\033[36m'
CL='\033[m'

header_info() {
clear
cat <<"EOF"
    _   _             _   _ _           
   | \ | | __ _ _   _| |_(_) |_   _ ___ 
   |  \| |/ _` | | | | __| | | | | / __|
   | |\  | (_| | |_| | |_| | | |_| \__ \
   |_| \_|\__,_|\__,_|\__|_|_|\__,_|___/
                                       
   Update Script                       
EOF
}

msg_info() { echo -e "${BL}[INFO]${CL} $1"; }
msg_ok() { echo -e "${GN}[OK]${CL} $1"; }
msg_error() { echo -e "${RD}[ERROR]${CL} $1"; }

update_nautilus() {
  local ct_id=$1
  
  msg_info "Stopping Nautilus service..."
  if ! pct exec $ct_id -- systemctl stop nautilus; then
    msg_error "Failed to stop Nautilus service"
    return 1
  fi
  msg_ok "Service stopped"
  
  msg_info "Backing up current configuration..."
  if ! pct exec $ct_id -- cp /opt/nautilus/data/config.json /opt/nautilus/data/config.json.backup; then
    msg_error "Failed to backup configuration"
    return 1
  fi
  msg_ok "Configuration backed up"
  
  msg_info "Updating Nautilus from repository..."
  if ! pct exec $ct_id -- su - nautilus -c "
    cd /opt/nautilus
    git fetch origin
    git reset --hard origin/main
    npm install --production
    npm run build
  "; then
    msg_error "Failed to update Nautilus"
    return 1
  fi
  msg_ok "Nautilus updated"
  
  msg_info "Restoring configuration..."
  if ! pct exec $ct_id -- cp /opt/nautilus/data/config.json.backup /opt/nautilus/data/config.json; then
    msg_error "Failed to restore configuration"
    return 1
  fi
  msg_ok "Configuration restored"
  
  msg_info "Starting Nautilus service..."
  if ! pct exec $ct_id -- systemctl start nautilus; then
    msg_error "Failed to start Nautilus service"
    return 1
  fi
  msg_ok "Service started"
  
  msg_info "Verifying service status..."
  sleep 3
  if ! pct exec $ct_id -- systemctl is-active --quiet nautilus; then
    msg_error "Nautilus service is not running properly"
    return 1
  fi
  msg_ok "Service is running"
  
  # Get version info
  local version=$(pct exec $ct_id -- su - nautilus -c "cd /opt/nautilus && git describe --tags --always" 2>/dev/null || echo "unknown")
  msg_ok "Update completed successfully! Version: $version"
  
  return 0
}

check_container() {
  local ct_id=$1
  
  if ! pct status $ct_id >/dev/null 2>&1; then
    msg_error "Container $ct_id does not exist"
    return 1
  fi
  
  if [[ $(pct status $ct_id) != "status: running" ]]; then
    msg_error "Container $ct_id is not running"
    return 1
  fi
  
  if ! pct exec $ct_id -- test -d /opt/nautilus; then
    msg_error "Nautilus installation not found in container $ct_id"
    return 1
  fi
  
  return 0
}

# Main execution
header_info
echo
echo -e " ${GN}Nautilus Update Script${CL}"
echo -e " Updates an existing Nautilus LXC installation"
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
  msg_error "This script must be run as root"
  exit 1
fi

# Check if Proxmox
if ! command -v pct >/dev/null 2>&1; then
  msg_error "This script must be run on a Proxmox VE host"
  exit 1
fi

# Get container ID
if [[ $# -eq 1 ]]; then
  CT_ID=$1
else
  echo -e "${YW}Available Nautilus containers:${CL}"
  
  # Find containers with Nautilus
  found_containers=()
  for ct in $(pct list | awk 'NR>1 {print $1}'); do
    if pct exec $ct -- test -d /opt/nautilus 2>/dev/null; then
      hostname=$(pct exec $ct -- hostname 2>/dev/null || echo "unknown")
      status=$(pct status $ct | cut -d' ' -f2)
      echo -e " ${BL}$ct${CL} - $hostname ($status)"
      found_containers+=($ct)
    fi
  done
  
  if [[ ${#found_containers[@]} -eq 0 ]]; then
    msg_error "No Nautilus installations found"
    exit 1
  fi
  
  echo
  read -p "Enter the container ID to update: " CT_ID
fi

# Validate container
if ! check_container $CT_ID; then
  exit 1
fi

# Get container info
hostname=$(pct exec $CT_ID -- hostname 2>/dev/null || echo "unknown")
current_version=$(pct exec $CT_ID -- su - nautilus -c "cd /opt/nautilus && git describe --tags --always" 2>/dev/null || echo "unknown")

echo
echo -e "${BL}Container Information:${CL}"
echo -e " Container ID: $CT_ID"
echo -e " Hostname: $hostname"
echo -e " Current Version: $current_version"
echo

read -p "Continue with update? [y/N]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Update cancelled"
  exit 0
fi

echo
msg_info "Starting update process..."

if update_nautilus $CT_ID; then
  echo
  echo -e "${GN}✓ Update completed successfully!${CL}"
  
  # Get container IP
  IP=$(pct exec $CT_ID -- hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")
  echo -e " Access your updated Nautilus at: ${GN}http://$IP${CL}"
else
  echo
  msg_error "Update failed! Check the logs above for details."
  exit 1
fi