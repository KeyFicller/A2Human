#!/usr/bin/env bash
# Postgres and Redis for the API, then the pages on the public port.
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v docker >/dev/null 2>&1; then
  docker compose up -d postgres redis
  for _ in $(seq 1 60); do
    if python3 -c 'import socket; socket.create_connection(("127.0.0.1", 5432), 1).close()' 2>/dev/null \
      && python3 -c 'import socket; socket.create_connection(("127.0.0.1", 6379), 1).close()' 2>/dev/null; then
      break
    fi
    sleep 1
  done
fi
python3 -m a2human.migrate
bash .devcontainer/start.sh
