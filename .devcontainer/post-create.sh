#!/usr/bin/env bash
# Node for the pages, Python 3.12 for the API. zh_CN keeps on-duty name order.
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v sudo >/dev/null 2>&1 && ! locale -a 2>/dev/null | grep -qi 'zh_CN.utf'; then
  sudo apt-get update
  sudo apt-get install -y locales
  sudo sed -i 's/^# *zh_CN.UTF-8 UTF-8/zh_CN.UTF-8 UTF-8/' /etc/locale.gen
  sudo locale-gen zh_CN.UTF-8
fi
npm install
python3 -m pip install -e ".[dev]"
