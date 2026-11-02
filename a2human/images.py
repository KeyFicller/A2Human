"""Image parts accepted on a task: png, jpeg, webp, or gif.

A part may carry base64 (``raw``) or an http(s) URL. Raw bytes are checked
against the declared media type so a mislabeled file is rejected.
"""

from __future__ import annotations

import base64
import re
from typing import Any

from a2human.copy import wire

IMAGE_TYPES = ("image/png", "image/jpeg", "image/webp", "image/gif")
RAW_MAX = 1_500_000


def filename_of(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip().replace("\\", "/").split("/")[-1].strip()
    if not trimmed:
        return None
    return trimmed[:80]


def _matches(media: str, data: bytes) -> bool:
    if media == "image/png":
        return data[:8] == bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    if media == "image/jpeg":
        return len(data) >= 3 and data[0] == 0xFF and data[1] == 0xD8 and data[2] == 0xFF
    if media == "image/gif":
        return data[:6] in (b"GIF87a", b"GIF89a")
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def _decode_raw(media: str, raw_value: str, filename: str | None) -> dict[str, Any] | dict[str, str]:
    if len(raw_value) > RAW_MAX:
        return {"error": wire("image.tooBig")}
    if not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", raw_value):
        return {"error": wire("image.base64")}
    padded = raw_value + "=" * (-len(raw_value) % 4)
    try:
        data = base64.b64decode(padded, validate=True)
    except Exception:
        return {"error": wire("image.base64")}
    if len(data) < 12 or not _matches(media, data):
        return {"error": wire("image.mismatch")}
    image: dict[str, Any] = {"mediaType": media, "raw": raw_value}
    if filename:
        image["filename"] = filename
    return {"image": image}


def read_image(value: object) -> dict[str, Any]:
    """Return ``{"image": ...}`` or ``{"error": "..."}``."""
    if not isinstance(value, dict):
        return {"error": wire("image.format")}
    media = value.get("mediaType", value.get("media_type"))
    if media not in IMAGE_TYPES:
        return {"error": wire("image.types")}
    filename = filename_of(value.get("filename"))
    raw_value = re.sub(r"\s", "", value["raw"]) if isinstance(value.get("raw"), str) else ""
    if raw_value:
        return _decode_raw(media, raw_value, filename)
    url_value = value["url"].strip() if isinstance(value.get("url"), str) else ""
    if url_value.startswith("data:"):
        matched = re.fullmatch(r"data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)", url_value)
        if not matched or matched.group(1) != media:
            return {"error": wire("image.mismatch")}
        return read_image({"mediaType": media, "raw": matched.group(2), "filename": filename})
    if re.match(r"^https?://", url_value) and len(url_value) <= 2000:
        image = {"mediaType": media, "url": url_value}
        if filename:
            image["filename"] = filename
        return {"image": image}
    return {"error": wire("image.needsData")}
