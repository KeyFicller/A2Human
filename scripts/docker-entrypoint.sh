#!/bin/sh
# Public port 3847 is the Next server. The API stays on loopback.
set -eu
python -m uvicorn a2human.main:app --host 127.0.0.1 --port 3848 &
i=0
while [ "$i" -lt 50 ]; do
  if python -c 'import socket; socket.create_connection(("127.0.0.1", 3848), 1).close()' 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 0.1
done
exec node server.js
