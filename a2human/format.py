"""Short Chinese (or English) lines shown on cards and inside MCP tool text."""

from __future__ import annotations

import math

from a2human.copy import phrase

KIND_PATH = {
    "task.submit": "format.kind.submit",
    "task.artifact": "format.kind.artifact",
    "task.complete": "format.kind.complete",
    "task.cancel": "format.kind.cancel",
    "task.note": "format.kind.note",
    "task.reject": "format.kind.reject",
    "task.fail": "format.kind.fail",
    "task.input": "format.kind.input",
    "task.scoreRequest": "format.kind.scoreRequest",
    "task.score": "format.kind.score",
}


def _js_round(value: float) -> int:
    # Math.round: halves go toward +infinity.
    return math.floor(value + 0.5)


def _duration_parts(seconds: float) -> tuple[str, str]:
    whole = max(0, _js_round(seconds))
    if whole < 60:
        return "sec", str(whole)
    minutes = _js_round(whole / 60)
    if minutes < 60:
        return "min", str(minutes)
    hours = whole / 3600
    if hours < 24:
        shown = _js_round(hours * 10) / 10
        if float(shown).is_integer():
            return "hr", str(int(shown))
        return "hr", f"{shown:.1f}"
    days = _js_round((whole / 86400) * 10) / 10
    if float(days).is_integer():
        return "day", str(int(days))
    return "day", f"{days:.1f}"


def duration_value(seconds: float, locale: str = "zh") -> str:
    unit, value = _duration_parts(seconds)
    word_path = "format.dayOne" if unit == "day" and value == "1" else f"format.units.{unit}"
    return f"{value} {phrase(word_path, None, locale)}"


def duration_phrase(seconds: float, locale: str = "zh") -> str:
    return phrase("format.avg", {"value": duration_value(seconds, locale)}, locale)


def score_value(average_score: float | None) -> str | None:
    if average_score is None or not math.isfinite(average_score):
        return None
    if float(average_score).is_integer():
        return str(int(average_score))
    return f"{average_score:.1f}"


def record_line(
    completed: int = 0,
    average_score: float | None = None,
    average_duration: float | None = None,
    locale: str = "zh",
) -> str:
    shown = score_value(average_score)
    score = phrase("format.noScore", None, locale) if shown is None else phrase("format.score", {"score": shown}, locale)
    duration = phrase("format.noTime", None, locale) if average_duration is None else duration_phrase(average_duration, locale)
    return phrase("format.line", {"completed": completed, "score": score, "duration": duration}, locale)


def status_label(status: str, locale: str = "zh") -> str:
    return phrase(f"format.status.{status}", None, locale)


def kind_label(kind: str, locale: str = "zh") -> str:
    return phrase(KIND_PATH[kind], None, locale)
