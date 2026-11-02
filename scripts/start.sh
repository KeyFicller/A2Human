#!/usr/bin/env bash
# Production on one machine: built Next server plus several API workers.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m a2human.migrate
if ! python3 -c 'import socket; socket.create_connection(("127.0.0.1", 3848), 1).close()' 2>/dev/null; then
  setsid python3 -m gunicorn a2human.main:app -k uvicorn.workers.UvicornWorker -w "${WEB_CONCURRENCY:-4}" -b 127.0.0.1:3848 --timeout 120 \
    > /tmp/a2human-api.log 2>&1 < /dev/null &
  echo $! > /tmp/a2human-api.pid
  for _ in $(seq 1 50); do
    if python3 -c 'import socket; socket.create_connection(("127.0.0.1", 3848), 1).close()' 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
fi

exec npx next start -H 0.0.0.0 -p 3847
