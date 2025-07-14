#!/bin/sh
# Entrypoint script for Nautilus Docker container
# Ensures config.json is initialized from defaultConfig.json if missing

CONFIG_PATH="/data/config.json"
DEFAULT_PATH="/app/defaultConfig.json"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "Initializing config.json from defaultConfig.json..."
  cp "$DEFAULT_PATH" "$CONFIG_PATH"
else
  echo "config.json already exists, skipping initialization."
fi

# Start only the server (frontend is already built and copied)
exec node server/index.js
