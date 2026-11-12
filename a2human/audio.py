"""Audio parts accepted on a task: webm, wav, or mpeg.

A part may carry base64 (``raw``) or an http(s) URL. Raw bytes are checked
against the declared media type so a mislabeled file is rejected.
"""

from __future__ import annotations

import base64
import re
from typing import Any

from a2human.copy import wire

AUDIO_TYPES = ("audio/webm", "audio/wav", "audio/mpeg")
RAW_MAX = 3_000_000


def _normalize(media: str) -> str | None:
    base = media.split(";", 1)[0].strip().lower()
    if base in {"audio/wav", "audio/wave", "audio/x-wav"}:
        return "audio/wav"
    if base in {"audio/mpeg", "audio/mp3"}:
        return "audio/mpeg"
    if base == "audio/webm":
        return "audio/webm"
    return None


def _matches(media: str, data: bytes) -> bool:
    if media == "audio/wav":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"
    if media == "audio/mpeg":
        if data[:3] == b"ID3":
            return True
        return len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0
    return data[:4] == b"\x1a\x45\xdf\xa3"


def _decode_raw(media: str, raw_value: str, filename: str | None) -> dict[str, Any]:
    if len(raw_value) > RAW_MAX:
        return {"error": wire("audio.tooBig")}
    if not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", raw_value):
        return {"error": wire("audio.base64")}
    padded = raw_value + "=" * (-len(raw_value) % 4)
    try:
        data = base64.b64decode(padded, validate=True)
    except Exception:
        return {"error": wire("audio.base64")}
    if len(data) < 4 or not _matches(media, data):
        return {"error": wire("audio.mismatch")}
    audio: dict[str, Any] = {"mediaType": media, "raw": raw_value}
    if filename:
        audio["filename"] = filename
    return {"audio": audio}


def read_audio(value: object) -> dict[str, Any]:
    """Return ``{"audio": ...}`` or ``{"error": "..."}``."""
    if not isinstance(value, dict):
        return {"error": wire("audio.format")}
    media = _normalize(str(value.get("mediaType", value.get("media_type")) or ""))
    if media not in AUDIO_TYPES:
        return {"error": wire("audio.types")}
    filename = value.get("filename") if isinstance(value.get("filename"), str) else None
    if isinstance(filename, str):
        filename = filename.strip().replace("\\", "/").split("/")[-1].strip()[:80] or None
    raw_value = re.sub(r"\s", "", value["raw"]) if isinstance(value.get("raw"), str) else ""
    if raw_value:
        return _decode_raw(media, raw_value, filename)
    url_value = value["url"].strip() if isinstance(value.get("url"), str) else ""
    if url_value.startswith("data:"):
        matched = re.fullmatch(r"data:(audio/[\w.+-]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\s]+)", url_value)
        if not matched or _normalize(matched.group(1)) != media:
            return {"error": wire("audio.mismatch")}
        return read_audio({"mediaType": media, "raw": matched.group(2), "filename": filename})
    if re.match(r"^https?://", url_value) and len(url_value) <= 2000:
        audio = {"mediaType": media, "url": url_value}
        if filename:
            audio["filename"] = filename
        return {"audio": audio}
    return {"error": wire("audio.needsData")}
