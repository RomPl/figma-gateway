#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/figma-gateway.vazovski.art"
SERVICE_NAME="figma-gateway.service"
UNIT_SOURCE="$APP_DIR/deploy/systemd/$SERVICE_NAME"
UNIT_TARGET="/etc/systemd/system/$SERVICE_NAME"

cd "$APP_DIR"

/usr/bin/npm ci
/usr/bin/npm run build
/usr/bin/npm run check
/usr/bin/npm test

if [[ ! -f "$UNIT_TARGET" ]]; then
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "systemd unit is not installed: $UNIT_TARGET" >&2
    echo "Run as root once or install the unit manually." >&2
    exit 1
  fi

  /usr/bin/install -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
  /usr/bin/systemctl daemon-reload
  /usr/bin/systemctl enable "$SERVICE_NAME"
else
  if ! /usr/bin/cmp -s "$UNIT_SOURCE" "$UNIT_TARGET"; then
    if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
      echo "systemd unit differs from repository version: $UNIT_TARGET" >&2
      echo "Run as root once or sync the unit manually." >&2
      exit 1
    fi

    /usr/bin/install -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
    /usr/bin/systemctl daemon-reload
  fi
fi

/usr/bin/systemctl restart "$SERVICE_NAME"
/usr/bin/systemctl status "$SERVICE_NAME" --no-pager
/usr/bin/npm run self-check
