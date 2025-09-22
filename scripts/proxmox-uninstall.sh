#!/usr/bin/env bash

# Nautilus Uninstall Script for Proxmox LXC
# Removes a Nautilus LXC container

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
                                       
   Uninstall Script                   
EOF
}

msg_info() { echo -e "${BL}[INFO]${CL} $1"; }
msg_ok() { echo -e "${GN}[OK]${CL} $1"; }
msg_error() { echo -e "${RD}[ERROR]${CL} $1"; }
msg_warn() { echo -e "${YW}[WARN]${CL} $1"; }

check_container() {
  local ct_id=$1
  
  if ! pct status $ct_id >/dev/null 2>&1; then
    msg_error "Container $ct_id does not exist"
    return 1
  fi
  
  return 0
}

backup_config() {
  local ct_id=$1
  local backup_file="/tmp/nautilus-$ct_id-config-$(date +%Y%m%d-%H%M%S).json"
  
  msg_info "Creating configuration backup..."
  
  if pct exec $ct_id -- test -f /opt/nautilus/data/config.json 2>/dev/null; then
    if pct exec $ct_id -- cat /opt/nautilus/data/config.json > "$backup_file" 2>/dev/null; then
      msg_ok "Configuration backed up to: $backup_file"
      echo -e "   ${YW}Keep this file to restore your Nautilus configuration later${CL}"
      return 0
    else
      msg_warn "Failed to backup configuration"
      return 1
    fi
  else
    msg_warn "No configuration file found to backup"
    return 1
  fi
}

remove_container() {
  local ct_id=$1
  local force=$2
  
  # Stop container if running
  if [[ $(pct status $ct_id) == "status: running" ]]; then
    msg_info "Stopping container $ct_id..."
    if ! pct stop $ct_id; then
      msg_error "Failed to stop container"
      return 1
    fi
    msg_ok "Container stopped"
  fi
  
  # Destroy container
  msg_info "Removing container $ct_id..."
  if [[ "$force" == "true" ]]; then
    if ! pct destroy $ct_id --force; then
      msg_error "Failed to remove container"
      return 1
    fi
  else
    if ! pct destroy $ct_id; then
      msg_error "Failed to remove container"
      return 1
    fi
  fi
  msg_ok "Container removed"
  
  return 0
}

# Main execution
header_info
echo
echo -e " ${RD}Nautilus Uninstall Script${CL}"
echo -e " ${YW}⚠️  This will permanently remove a Nautilus LXC container${CL}"
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
  read -p "Enter the container ID to remove: " CT_ID
fi

# Validate container
if ! check_container $CT_ID; then
  exit 1
fi

# Get container info
hostname=$(pct exec $CT_ID -- hostname 2>/dev/null || echo "unknown")
status=$(pct status $CT_ID | cut -d' ' -f2)

echo
echo -e "${BL}Container Information:${CL}"
echo -e " Container ID: $CT_ID"
echo -e " Hostname: $hostname"
echo -e " Status: $status"
echo

# Backup configuration
echo -e "${YW}Do you want to backup the Nautilus configuration before removal?${CL}"
read -p "Backup config? [Y/n]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  backup_config $CT_ID
fi

echo
echo -e "${RD}⚠️  WARNING: This action cannot be undone!${CL}"
echo -e "${RD}   All data in container $CT_ID will be permanently lost.${CL}"
echo

read -p "Type 'REMOVE' to confirm removal: " confirmation
if [[ "$confirmation" != "REMOVE" ]]; then
  echo "Removal cancelled"
  exit 0
fi

echo
read -p "Force removal if container is stuck? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  FORCE="true"
else
  FORCE="false"
fi

echo
msg_info "Starting removal process..."

if remove_container $CT_ID $FORCE; then
  echo
  echo -e "${GN}✓ Nautilus container $CT_ID has been successfully removed${CL}"
  
  # Check for backups
  backups=$(ls /tmp/nautilus-$CT_ID-config-*.json 2>/dev/null || echo "")
  if [[ -n "$backups" ]]; then
    echo
    echo -e "${BL}Configuration backups available:${CL}"
    for backup in $backups; do
      echo -e " $backup"
    done
    echo -e "${YW}Keep these files safe if you plan to reinstall Nautilus${CL}"
  fi
else
  echo
  msg_error "Removal failed! Check the logs above for details."
  msg_info "You may need to manually remove the container using: pct destroy $CT_ID --force"
  exit 1
fi