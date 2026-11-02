"""UTC timestamps in the same shape as ``Date.toISOString()``."""

from __future__ import annotations

import calendar
import time
from datetime import datetime, timezone


def now_ms() -> int:
    return int(time.time() * 1000)


def now_iso(at_ms: int | None = None) -> str:
    if at_ms is None:
        at_ms = now_ms()
    seconds, millis = divmod(int(at_ms), 1000)
    moment = datetime.fromtimestamp(seconds, timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{millis:03d}Z"


def parse_ms(value: str) -> int:
    text = value[:-1] + "+00:00" if value.endswith("Z") else value
    moment = datetime.fromisoformat(text)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    moment = moment.astimezone(timezone.utc)
    return calendar.timegm(moment.utctimetuple()) * 1000 + moment.microsecond // 1000
