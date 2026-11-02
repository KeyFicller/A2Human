#!/usr/bin/env bash
# Production without Docker: built Next server on 3847, Python API beside it.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! python3 -c 'import socket; socket.create_connection(("127.0.0.1", 3848), 1).close()' 2>/dev/null; then
  setsid python3 -m uvicorn a2human.main:app --host 127.0.0.1 --port 3848 > /tmp/a2human-api.log 2>&1 < /dev/null &
  echo $! > /tmp/a2human-api.pid
  for _ in $(seq 1 50); do
    if python3 -c 'import socket; socket.create_connection(("127.0.0.1", 3848), 1).close()' 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
fi

exec npx next start -H 0.0.0.0 -p 3847
