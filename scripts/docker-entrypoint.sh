#!/bin/sh
# Pages on 3847. Several API workers on 127.0.0.1:3848 share Postgres and Redis.
set -eu
python -m a2human.migrate
python -m gunicorn a2human.main:app -k uvicorn.workers.UvicornWorker -w "${WEB_CONCURRENCY:-4}" -b 127.0.0.1:3848 --timeout 120 &
i=0
while [ "$i" -lt 50 ]; do
  if python -c 'import socket; socket.create_connection(("127.0.0.1", 3848), 1).close()' 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 0.2
done
exec node server.js
