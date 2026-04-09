#!/usr/bin/env bash

# Nautilus Docker Update Script
# Tags the current image as a dated backup before rebuilding,
# so you can roll back if the new build has issues.

set -Eeuo pipefail

# Colors
RD='\033[01;31m'
GN='\033[1;92m'
BL='\033[36m'
YW='\033[33m'
CL='\033[m'

msg_info()  { echo -e "${BL}[INFO]${CL} $1"; }
msg_ok()    { echo -e "${GN}[OK]${CL} $1"; }
msg_error() { echo -e "${RD}[ERROR]${CL} $1"; }

# Require docker / docker compose
if ! command -v docker &>/dev/null; then
  msg_error "Docker is not installed or not in PATH"
  exit 1
fi

COMPOSE_CMD=""
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
else
  msg_error "Neither 'docker compose' nor 'docker-compose' found"
  exit 1
fi

# Move to project root (one level up from scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_TAG="nautilus:backup-$DATE"

echo
echo -e " ${GN}Nautilus Docker Update${CL}"
echo

# Tag existing image as backup
if docker image inspect nautilus:latest &>/dev/null 2>&1; then
  msg_info "Tagging current image as backup: $BACKUP_TAG"
  docker tag nautilus:latest "$BACKUP_TAG"
  msg_ok "Backup image created: $BACKUP_TAG"
else
  msg_info "No existing nautilus:latest image found — skipping backup tag (first build)"
fi

# Build and restart
msg_info "Building new image and restarting..."
if ! $COMPOSE_CMD up --build -d; then
  msg_error "Build or startup failed!"
  if docker image inspect "$BACKUP_TAG" &>/dev/null 2>&1; then
    echo
    echo -e " ${YW}To roll back to the previous version:${CL}"
    echo -e "   docker tag $BACKUP_TAG nautilus:latest"
    echo -e "   $COMPOSE_CMD up -d"
  fi
  exit 1
fi
msg_ok "New image built and container started"

# Health check
msg_info "Waiting for service to be healthy..."
PORT=$(grep -oP '(?<=NAUTILUS_SERVER_PORT=)\d+' .env 2>/dev/null || echo "3069")
max_attempts=15
attempt=0
healthy=false
while [[ $attempt -lt $max_attempts ]]; do
  sleep 2
  if curl -sf --max-time 3 "http://localhost:$PORT/api/config" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  attempt=$((attempt + 1))
  msg_info "Waiting for service... ($attempt/$max_attempts)"
done

if [[ "$healthy" != "true" ]]; then
  msg_error "Service did not become healthy within $((max_attempts * 2))s"
  echo -e " ${YW}Check logs with:${CL} docker logs nautilus"
  if docker image inspect "$BACKUP_TAG" &>/dev/null 2>&1; then
    echo
    echo -e " ${YW}To roll back:${CL}"
    echo -e "   docker tag $BACKUP_TAG nautilus:latest"
    echo -e "   $COMPOSE_CMD up -d"
  fi
  exit 1
fi

msg_ok "Service is healthy (HTTP response confirmed)"
echo
echo -e "${GN}✓ Update complete!${CL}"
echo -e " Backup image: ${BL}$BACKUP_TAG${CL}"
echo -e " To roll back: docker tag $BACKUP_TAG nautilus:latest && $COMPOSE_CMD up -d"
echo -e " To clean up old backups: docker images 'nautilus' --format '{{.Tag}}' | grep backup"
echo
