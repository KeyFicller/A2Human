import json
import re
from pathlib import Path

_DIR = Path(__file__).parent / "locales"
_CACHE: dict[str, dict] = {}


def _load(locale: str) -> dict:
    cached = _CACHE.get(locale)
    if cached is None:
        cached = json.loads((_DIR / f"{locale}.json").read_text(encoding="utf-8"))
        _CACHE[locale] = cached
    return cached


def fill(template: str, **vars: object) -> str:
    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        return str(vars[key]) if key in vars else match.group(0)

    return re.sub(r"\{(\w+)\}", repl, template)


def phrase(path: str, locale: str = "zh", **vars: object) -> str:
    node: object = _load(locale)
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            raise KeyError(path)
        node = node[part]
    if not isinstance(node, str):
        raise KeyError(path)
    return fill(node, **vars)
