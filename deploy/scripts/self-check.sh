#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/figma-gateway.vazovski.art"
ENV_FILE="$APP_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env is missing in $APP_DIR" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

HOST_VALUE="${HOST:-127.0.0.1}"
PORT_VALUE="${PORT:-3000}"

if [[ "$HOST_VALUE" == "0.0.0.0" ]]; then
  HOST_VALUE="127.0.0.1"
fi

HOST_VALUE="$HOST_VALUE" PORT_VALUE="$PORT_VALUE" /usr/bin/node <<'NODE'
const host = process.env.HOST_VALUE || '127.0.0.1';
const port = process.env.PORT_VALUE || '3000';
const endpoints = [`http://${host}:${port}/health`, `http://${host}:${port}/version`];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = async () => {
  for (const url of endpoints) {
    let lastError = null;
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      try {
        const response = await fetch(url, { headers: { accept: 'application/json' } });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (!payload || payload.success !== true) {
          throw new Error('invalid payload');
        }
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await sleep(1000);
      }
    }
    if (lastError) {
      throw new Error(`Self-check failed for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }
  }
};
run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
NODE
