#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/figma-gateway.vazovski.art"

cd "$APP_DIR"

if [[ ! -f ".env" ]]; then
  echo ".env is missing in $APP_DIR" >&2
  exit 1
fi

exec /usr/bin/npm run start:prod
