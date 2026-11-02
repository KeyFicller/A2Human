#!/usr/bin/env bash
# Boot the dev server without blocking Codespace startup.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f /tmp/a2human-dev.pid ]] && kill -0 "$(cat /tmp/a2human-dev.pid)" 2>/dev/null; then
  exit 0
fi
setsid npm run dev > /tmp/a2human-dev.log 2>&1 < /dev/null &
echo $! > /tmp/a2human-dev.pid
