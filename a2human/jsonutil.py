"""JSON helpers that match JavaScript JSON.stringify / JSON.parse."""

from __future__ import annotations

import json
import math
from typing import Any


def js_normalize(value: Any) -> Any:
    """Turn whole-number floats into ints, the way JSON numbers work in JS."""
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {key: js_normalize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [js_normalize(item) for item in value]
    return value


def dumps(value: Any, *, pretty: bool = False) -> str:
    normalized = js_normalize(value)
    if pretty:
        return json.dumps(normalized, ensure_ascii=False, indent=2, allow_nan=False)
    return json.dumps(normalized, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def loads(text: str) -> Any:
    return js_normalize(json.loads(text))
